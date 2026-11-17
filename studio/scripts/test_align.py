"""Aligner test on real Urdu-English data: script = Roman Urdu captions, 'spoken' = the Urdu-script
version with synthetic timings + damage (dropped words, fillers). Truth only where a line has the same
word count in both scripts (1:1 by position)."""
import json, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from align import timed_script, skeleton, similarity

def run(path, drop=0.08, fill=0.06, seed=0):
    rnd = random.Random(seed)
    beats = json.load(open(path, encoding="utf-8"))["beats"]
    script, spoken, truth, t = [], [], [], 0.2
    for b in beats:
        rt, ut = b.get("text", "").split(), (b.get("speak") or b.get("text", "")).split()
        one2one = len(rt) == len(ut)
        times = []
        for w in ut:
            if rnd.random() < fill:  # ad-lib filler
                spoken.append({"w": rnd.choice(["umm", "یار", "اچھا", "so"]), "start": t, "end": t + 0.25}); t += 0.3
            d = 0.12 + 0.045 * len(w)
            times.append((t, t + d))
            if rnd.random() >= drop:  # recogniser missed / speaker skipped
                spoken.append({"w": w, "start": round(t, 3), "end": round(t + d, 3)})
            t += d + 0.05
        t += 0.25
        for k, w in enumerate(rt):
            script.append(w); truth.append(times[k] if one2one else None)
    out, rate = timed_script(script, spoken)
    ok = [abs(o["start"] - tr[0]) < 0.06 for o, tr in zip(out, truth) if tr is not None]
    err = [abs(o["start"] - tr[0]) for o, tr in zip(out, truth) if tr is not None]
    err.sort()
    return len(script), rate, sum(ok) / len(ok), err[len(err) // 2], err[int(len(err) * 0.95)]

if __name__ == "__main__":
    for p in sys.argv[1:]:
        for drop, fill in ((0.0, 0.0), (0.08, 0.06), (0.2, 0.12)):
            n, rate, acc, med, p95 = run(p, drop, fill)
            print(f"{os.path.basename(p)[:40]:40s} drop {drop:.2f} fill {fill:.2f}: {n} words · matched {100*rate:.0f}% · exact time {100*acc:.0f}% · median err {med*1000:.0f} ms · p95 {p95*1000:.0f} ms")
    for a, b in (("nahi", "نہیں"), ("founder", "فاؤنڈر"), ("hai", "ہے"), ("Pakistan", "پاکستان"), ("zero", "زیرو"), ("mentorship", "مینٹورشپ"), ("aap", "آپ"), ("ke", "کے")):
        print(f"  {a:12s} {b:10s} skel {skeleton(a):8s} {skeleton(b):8s} sim {similarity(a, b):.2f}")
