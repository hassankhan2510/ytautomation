"""
STUDIO — MUSIC FIT: re-arrange the music bed to the STORY, the way an editor cuts a track by hand.

A looped bed gets chopped mid-bar when the video ends and its big moment lands anywhere. Instead:
  1. beat tracking — spectral-flux onset envelope -> tempo by autocorrelation (log-normal prior around
     110 BPM) -> beats by dynamic programming (Ellis 2007) -> bars of 4 (downbeat phase = strongest
     low-frequency onsets)
  2. per-bar features — loudness (RMS) and timbre (12-band log spectrum, unit norm)
  3. re-arrangement by dynamic programming over (output bar, source bar):
       cost = jump (1 - timbre similarity of 'the bar that would have come next' and 'the bar we jump
              to', + a fixed penalty — so jumps happen only where they sound like continuing)
            + drop alignment (at the story's reveal time, reward the source's biggest energy RISE)
            + ending (the last output bar should be one of the track's last bars = a real ending)
  4. render — bars concatenated with 12 ms equal-power crossfades at jumps; the result is EXACTLY the
     video's length (final bar trimmed with a short musical fade).

    python scripts/music_fit.py <music.mp3> <seconds> <drop_seconds> <out.wav> [report.json]
"""
import json
import subprocess
import sys

import numpy as np

SR = 22050


def load(path, sr=SR):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def stft_mag(y, n=1024, hop=512):
    w = np.hanning(n).astype(np.float32)
    frames = 1 + (len(y) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(y[idx] * w, axis=1)).astype(np.float32), hop


def onset_envelope(S):
    L = np.log1p(10 * S)
    flux = np.maximum(0, np.diff(L, axis=0)).sum(1)
    flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(16) / 16, "same")  # remove slow trend
    return np.maximum(flux, 0) / (flux.std() + 1e-9)


def tempo(env, fps):
    ac = np.correlate(env, env, "full")[len(env) - 1:]
    lags = np.arange(len(ac))
    bpm = 60 * fps / np.maximum(lags, 1)
    ok = (bpm >= 60) & (bpm <= 180)
    prior = np.exp(-0.5 * (np.log2(bpm / 110.0) / 0.9) ** 2)
    score = np.where(ok, ac * prior, -np.inf)
    return 60 * fps / int(np.argmax(score))


def track_beats(env, period, alpha=100.0):
    """Ellis 2007 dynamic-programming beat tracker; period in frames."""
    n = len(env)
    score, back = env.astype(np.float64).copy(), -np.ones(n, int)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    for t in range(hi, n):
        prev = np.arange(t - hi, t - lo)
        pen = -alpha * np.log((t - prev) / period) ** 2
        k = int(np.argmax(score[prev] + pen))
        score[t] = env[t] + score[prev][k] + pen[k]
        back[t] = prev[k]
    t = int(np.argmax(score[-hi:])) + n - hi
    beats = [t]
    while back[t] >= 0:
        t = back[t]
        beats.append(t)
    return np.array(beats[::-1])


def analyse(y):
    S, hop = stft_mag(y)
    fps = SR / hop
    env = onset_envelope(S)
    bpm = tempo(env, fps)
    beats = track_beats(env, 60 * fps / bpm)
    # downbeat phase: the beat offset (0..3) whose beats carry the most low-frequency onset energy
    low = np.maximum(0, np.diff(np.log1p(10 * S[:, :24]), axis=0)).sum(1)
    low = np.concatenate([[0], low])
    phase = int(np.argmax([low[beats[p::4]].mean() for p in range(4)]))
    bar_starts = beats[phase::4] * hop  # samples
    bars = [(int(a), int(b)) for a, b in zip(bar_starts[:-1], bar_starts[1:])]
    # features per bar
    bands = np.geomspace(2, S.shape[1] - 1, 13).astype(int)
    feats, energy = [], []
    for a, b in bars:
        fa, fb = a // hop, max(a // hop + 1, b // hop)
        seg = S[fa:fb]
        v = np.array([np.log1p(seg[:, bands[i]:bands[i + 1]].mean()) for i in range(12)])
        feats.append(v / (np.linalg.norm(v) + 1e-9))
        energy.append(float(np.sqrt((y[a:b] ** 2).mean())))
    return {"bpm": float(bpm), "bars": bars, "feats": np.array(feats), "energy": np.array(energy)}


def arrange(A, n_out, drop_bar, jump_pen=0.35):
    """DP over (output bar k, source bar j). Returns the list of source bars."""
    F, E = A["feats"], A["energy"]
    M = len(F)
    En = (E - E.min()) / (E.max() - E.min() + 1e-9)
    rise = np.concatenate([[0], np.maximum(0, np.diff(En))])
    sim = F @ F.T  # timbre similarity
    INF = 1e9
    cost = np.full((n_out, M), INF)
    back = np.zeros((n_out, M), int)
    cost[0] = 0.15 * np.arange(M) / M  # prefer starting near the top of the track
    for k in range(1, n_out):
        # transition i -> j: free if j == i+1, else jump cost (does bar j sound like bar i+1 would?)
        nxt = np.minimum(np.arange(M) + 1, M - 1)
        trans = jump_pen + (1 - sim[nxt][:, :])  # [i, j]
        trans[np.arange(M - 1), np.arange(1, M)] = 0.0
        tot = cost[k - 1][:, None] + trans
        back[k] = np.argmin(tot, axis=0)
        cost[k] = tot[back[k], np.arange(M)]
        if k == drop_bar:
            cost[k] += 2.0 * (1 - rise / (rise.max() + 1e-9))  # the reveal wants the biggest lift
        cost[k] += 0.2 * (1 - En)  * (k > drop_bar)  # after the reveal, stay energetic
    end_bonus = np.zeros(M)
    end_bonus[-min(2, M):] = -1.5  # finish on the track's real ending
    j = int(np.argmin(cost[-1] + end_bonus))
    seq = [j]
    for k in range(n_out - 1, 0, -1):
        j = back[k][j]
        seq.append(int(j))
    return seq[::-1]


def render(y, A, seq, total_s, fade=0.012):
    bars, out = A["bars"], []
    xf = int(fade * SR)
    for k, j in enumerate(seq):
        a, b = bars[j]
        seg = y[a:b].copy()
        if out and seq[k - 1] + 1 != j and len(out[-1]) > xf and len(seg) > xf:
            t = np.linspace(0, np.pi / 2, xf)
            out[-1][-xf:] = out[-1][-xf:] * np.cos(t) + seg[:xf] * np.sin(t)
            seg = seg[xf:]
        out.append(seg)
    z = np.concatenate(out)
    n = int(round(total_s * SR))
    if len(z) < n:
        z = np.concatenate([z, np.zeros(n - len(z), np.float32)])
    z = z[:n]
    f = min(n, int(1.2 * SR))
    z[-f:] *= np.linspace(1, 0, f) ** 1.5
    return z


def splice_report(y, z, A, seq):
    """Seam audibility: spectral flux at each jump vs the track's typical bar-start flux."""
    S, _ = stft_mag(z)
    env = onset_envelope(S)
    hop = 512
    pos, jumps = 0, []
    for k, j in enumerate(seq):
        if k and seq[k - 1] + 1 != j:
            jumps.append(env[min(len(env) - 1, pos // hop)])
        a, b = A["bars"][j]
        pos += b - a
    typical = float(np.median(env[env > 0])) if (env > 0).any() else 1.0
    return {"jumps": len(jumps), "seam_flux_vs_typical": round(float(np.mean(jumps) / typical), 2) if jumps else None}


def fit(music, total_s, drop_s, out_wav):
    y = load(music)
    A = analyse(y)
    bar_s = float(np.median([(b - a) for a, b in A["bars"]])) / SR
    n_out = int(np.ceil(total_s / bar_s)) + 1
    drop_bar = int(np.clip(round(drop_s / bar_s), 1, n_out - 2))
    seq = arrange(A, n_out, drop_bar)
    z = render(y, A, seq, total_s)
    z = z / (np.abs(z).max() + 1e-9) * 0.89
    import os
    os.makedirs(os.path.dirname(os.path.abspath(out_wav)), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", out_wav], input=z.astype(np.float32).tobytes(), check=True)
    En = A["energy"]
    rise = np.concatenate([[0], np.diff(En)])
    return {"bpm": round(A["bpm"], 1), "bar_seconds": round(bar_s, 3), "source_bars": len(A["bars"]), "output_bars": n_out,
            "sequence": seq, "drop_bar": drop_bar, "drop_source_bar": seq[drop_bar],
            "drop_rise_rank": int((rise > rise[seq[drop_bar]]).sum()) + 1,
            "ends_on_track_ending": seq[-1] >= len(A["bars"]) - 2, "seconds": round(len(z) / SR, 3), **splice_report(y, z, A, seq)}


if __name__ == "__main__":
    music, total, drop, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    rep = fit(music, total, drop, out)
    print(json.dumps({k: v for k, v in rep.items() if k != "sequence"}))
    if len(sys.argv) > 5:
        json.dump(rep, open(sys.argv[5], "w"), indent=1)
