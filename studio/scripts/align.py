"""
STUDIO — ALIGN: put the SCRIPT's words on the timeline of a REAL voiceover (yours / ElevenLabs / phone).

Speech recognition (transcribe.py) gives what was actually said with word timings, but the screen shows
the SCRIPT — and they differ: ad-libs, skipped words, numbers ("1969" vs "nineteen sixty nine"), and for
Urdu reels the script is ROMAN Urdu ("Idea nahi hai?") while the recogniser writes URDU SCRIPT
("آئیڈیا نہیں ہے؟"). So both sides are reduced to a script-independent SOUND SKELETON (consonant classes;
vowels mostly dropped — Urdu script doesn't write short vowels either), then aligned with a global
dynamic-programming alignment (Needleman-Wunsch with fuzzy word similarity). Matched script words take the
spoken word's time; unmatched ones are interpolated between their matched neighbours by length.

    python scripts/align.py transcript.json script.txt   -> prints the timed script words
"""
import json
import re
import sys

# ── sound skeleton ─────────────────────────────────────────────────────────────────────────────────
# Consonant classes shared by Latin and Urdu script. Aspiration/retroflex/emphatic variants collapse.
_URDU = {
    "ب": "b", "پ": "p", "ت": "t", "ٹ": "t", "ط": "t", "ث": "s", "س": "s", "ص": "s", "ج": "j", "چ": "c",
    "ح": "h", "ہ": "h", "ھ": "", "ۃ": "t", "خ": "x", "د": "d", "ڈ": "d", "ذ": "z", "ز": "z", "ض": "z", "ظ": "z",
    "ژ": "z", "ر": "r", "ڑ": "r", "ش": "S", "ع": "", "غ": "G", "ف": "f", "ق": "k", "ک": "k", "ك": "k", "گ": "g",
    "ل": "l", "م": "m", "ن": "n", "ں": "n", "و": "v", "ی": "y", "ے": "y", "ي": "y", "ئ": "", "ء": "", "ا": "",
    "آ": "", "أ": "", "إ": "", "ۓ": "y", "ة": "t",
}
_LATIN_DIGRAPH = [("sh", "S"), ("ch", "c"), ("kh", "x"), ("gh", "G"), ("ph", "f"), ("th", "t"), ("dh", "d"),
                  ("bh", "b"), ("jh", "j"), ("rh", "r"), ("ck", "k"), ("qu", "kv"), ("ee", ""), ("oo", ""),
                  ("aa", ""), ("ai", "y"), ("ay", "y"), ("ey", "y")]
_LATIN = {"q": "k", "c": "k", "x": "ks", "w": "v", "z": "z", "y": "y"}
_DIGITS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
           "8": "eight", "9": "nine"}
_URDU_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def norm_token(t):
    """Lower-case, strip punctuation (keeps letters of every script and digits)."""
    t = t.translate(_URDU_DIGITS).lower()
    return re.sub(r"[^\w]", "", t, flags=re.UNICODE).replace("_", "")


def skeleton(tok):
    """Script-independent consonant skeleton: 'nahi' -> 'nh', 'نہیں' -> 'nhyn'->'nhn', 'founder' -> 'fndr'."""
    t = norm_token(tok)
    if not t:
        return ""
    if re.search(r"[؀-ۿ]", t):
        s = "".join(_URDU.get(ch, "") for ch in t)
    else:
        for a, b in _LATIN_DIGRAPH:
            t = t.replace(a, b)
        out = []
        for i, ch in enumerate(t):
            if ch in "aeiou":
                continue
            out.append(_LATIN.get(ch, ch) if ch.isalpha() else ch)
        s = "".join(out)
    # y/v/h are half-vowels: written in Urdu, often dropped in Roman (and vice versa) -> keep only
    # word-initially, then collapse doubled letters
    s = s[:1] + re.sub(r"[yvh]", "", s[1:])
    return re.sub(r"(.)\1+", r"\1", s)


def _lev(a, b):
    if a == b:
        return 0
    if not a or not b:
        return max(len(a), len(b))
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def similarity(a, b):
    """0..1 word similarity: exact surface match = 1, else skeleton edit similarity."""
    na, nb = norm_token(a), norm_token(b)
    if na and na == nb:
        return 1.0
    sa, sb = skeleton(a), skeleton(b)
    if not sa or not sb:
        return 0.35 if (not sa and not sb) else 0.0  # two pure-vowel words ("a"/"aa"): weak match
    d = _lev(sa, sb)
    return max(0.0, 1.0 - d / max(len(sa), len(sb)))


def expand_numbers(tokens):
    """'1969' in the script may be spoken as several words; give the aligner the spoken form for matching
    but remember which script token each piece belongs to."""
    out = []
    for i, t in enumerate(tokens):
        n = norm_token(t)
        if n.isdigit() and len(n) <= 4:
            out.append((i, " ".join(_DIGITS[d] for d in n)))
        else:
            out.append((i, t))
    return out


def align(script_tokens, spoken, gap=-0.45, min_sim=0.5):
    """Global alignment. script_tokens: [str]; spoken: [{w,start,end}]. Returns [(start,end)] per script
    token. Score: +sim (>= min_sim) for a match, `gap` for skipping a word on either side."""
    n, m = len(script_tokens), len(spoken)
    if n == 0:
        return []
    if m == 0:
        return [(None, None)] * n
    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    B = [[0] * (m + 1) for _ in range(n + 1)]  # 0 diag, 1 up (skip script), 2 left (skip spoken)
    for i in range(1, n + 1):
        S[i][0] = i * gap; B[i][0] = 1
    for j in range(1, m + 1):
        S[0][j] = j * gap; B[0][j] = 2
    sims = {}
    for i in range(1, n + 1):
        for j in range(max(1, int(i * m / n) - 60), min(m, int(i * m / n) + 60) + 1):  # band around the diagonal
            s = similarity(script_tokens[i - 1], spoken[j - 1]["w"])
            sims[(i, j)] = s
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = sims.get((i, j), 0.0)
            diag = S[i - 1][j - 1] + (s if s >= min_sim else -1.0)
            up, left = S[i - 1][j] + gap, S[i][j - 1] + gap
            best = max(diag, up, left)
            S[i][j] = best; B[i][j] = 0 if best == diag else (1 if best == up else 2)
    match = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        if B[i][j] == 0:
            if sims.get((i, j), 0.0) >= min_sim:
                match[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif B[i][j] == 1:
            i -= 1
        else:
            j -= 1
    return match


def timed_script(script_tokens, spoken):
    """Script words with times: matched -> spoken word time; unmatched -> spread over the gap between
    matched neighbours by length (so captions never jump backwards)."""
    match = align(script_tokens, spoken)
    n = len(script_tokens)
    times = [None] * n
    for i, j in enumerate(match):
        if j is not None:
            times[i] = (float(spoken[j]["start"]), float(spoken[j]["end"]))
    t_end = float(spoken[-1]["end"]) if spoken else 0.0
    i = 0
    while i < n:
        if times[i] is not None:
            i += 1
            continue
        k = i
        while k < n and times[k] is None:
            k += 1
        lo = times[i - 1][1] if i > 0 else (float(spoken[0]["start"]) if spoken else 0.0)
        hi = times[k][0] if k < n else max(t_end, lo + 0.3 * (k - i))
        hi = max(hi, lo + 0.08 * (k - i))
        wts = [len(norm_token(t)) + 1.2 for t in script_tokens[i:k]]
        tot, acc = sum(wts), 0.0
        for q in range(i, k):
            s = lo + acc / tot * (hi - lo)
            acc += wts[q - i]
            times[q] = (s, lo + acc / tot * (hi - lo))
        i = k
    # enforce monotone, non-overlapping
    out, last = [], 0.0
    for (s, e), w in zip(times, script_tokens):
        s = max(s, last); e = max(e, s + 0.04)
        out.append({"w": w, "start": round(s, 3), "end": round(e, 3)})
        last = s
    return out, sum(1 for j in match if j is not None) / max(1, n)


if __name__ == "__main__":
    tr = json.load(open(sys.argv[1], encoding="utf-8"))
    words = tr["words"] if isinstance(tr, dict) else tr
    script = open(sys.argv[2], encoding="utf-8").read().split()
    out, rate = timed_script(script, words)
    print(f"matched {100 * rate:.0f}% of script words")
    for w in out[:40]:
        print(f"{w['start']:7.2f} {w['end']:7.2f}  {w['w']}")
