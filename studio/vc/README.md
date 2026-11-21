# CUE — the studio's video language + compiler (v0, Week 1)

A free LLM writes a few lines of **intent** (`*.cue`); the compiler does the art direction and outputs a
fully resolved **plan** that the renderer only draws.

```
scene stat mood=serious
  say "Lekin seventy percent students kabhi start hi nahi karte"
  stat "70%" label="students kabhi start nahi karte" at="seventy"
```

| Solver | File | Guarantees (tested) |
|---|---|---|
| Parse | `parse.mjs` | line-numbered errors with a fix hint (fed back to the LLM) |
| Time | `timing.mjs` | scenes span the voice; cuts only in silence, snapped to a beat if one is there; each element enters as the voice names it (numbers ↔ number words) |
| Space | `layout.mjs` | box-glue stack per aspect (9:16, 1:1, 16:9, 4:5): largest type that fits, no overlap, inside the safe area, title ≥ 2× kicker; "does not fit" is reported, never overflowed |
| Space × time | `compile.mjs` | on-screen text must be readable while visible (≤ 4.5 words/s; spoken words count half) |
| Motion | `choreo.mjs` | entrance/exit/pulse from role × mood, seeded variation only inside the moves that suit the role; camera per `shot` |

Deterministic: same program + timestamps + seed → identical plan. `node --test` in this folder.
Honest v0 limits: text width is estimated (no font shaper), no renderer yet (next: Remotion `Cue` composition), no decompiler yet (Week 3).
