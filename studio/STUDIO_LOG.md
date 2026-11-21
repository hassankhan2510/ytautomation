# Studio — build log & roadmap

*Record as of 2026-11-18. The studio turns a script (+ your photos/clips/voiceover) into a finished vertical
reel, entirely in code, on free GitHub runners.*

## Ways to make a video
| workflow | input | use when |
|---|---|---|
| **Studio — Make Reel (one click)** `studio-make.yml` | a paragraph in the form | quick reel from text only |
| **Studio — Make from Project** `studio-project.yml` | folder `studio/projects/<name>/` (photos, clips, `assets.txt`, `voiceover.*`, `script.txt`) | your own media, from a computer |
| **Studio — Make from Web** `studio-web.yml` | the web page (`studio-web/`, Vercel) | from your phone — **generated** from studio-project.yml by `python studio/scripts/make_web_workflow.py` |
| **Studio — Render Reel** `studio-render.yml` | an existing draft JSON | re-render without new voice |

Finished videos: `https://github.com/hassankhan2510/ytautomation/releases/tag/reels` (web runs: `web-<run id>.mp4`).

## Engine features (what's built)
| feature | where | status / numbers |
|---|---|---|
| AI director: script, scene casting from ~100 motion primitives, fact-check | `scripts/draft.mjs`, `src/engine/registry.ts` | ✅ |
| Voices: your clone (Chatterbox), Urdu clone (OmniVoice), Sufyan / Pariya / Sabeha, Kokoro, Edge | `scripts/narrate.py`, `voice/<name>.wav` | ✅ add a speaker = clean wav + 2 dropdown options |
| Urdu: Urdu-script voice + Roman Urdu captions, word-for-word scripts in Urdu script | `draft.mjs`, `speakfix.mjs` | ✅ robust romanisation (batches, retries); Urdu punctuation ۔ ، ؟ → plain in the VOICE text (the "d" sound fix) |
| Pronunciation: years, numbers, acronyms (ABHI as a word) | `narrate.py english_speech`, `speakfix.mjs` | ✅ |
| Editor notes in pasted text are removed, not spoken | `draft.mjs` stage 0a | ✅ |
| Your own voiceover: speech recognition + **our script↔voice aligner** (Urdu script ⇄ Roman Urdu sound skeleton + Needleman-Wunsch) | `transcribe.py`, `align.py` | ✅ 99% words exact with 8% skips + 6% fillers on real Urdu drafts |
| Asset understanding: faces (YuNet / Haar), saliency, clip interest per second | `analyze_assets.py`, `faces.py` | ✅ OpenCV must be <5 (5 dropped Haar) |
| Placement by meaning, every asset used, ≤2 uses, ≤60% of scenes, clips trimmed to best seconds, subject-centred crops | `props.mjs` (PROJECT_ANALYSIS), `bgmedia.tsx` | ✅ |
| Music re-arranged to the story (own beat tracker + DP over bars) | `music_fit.py`, `music_apply.py` | ✅ drop on the #1 lift in 100% of 39 cases, real ending, exact length |
| Self-check loop: faces under captions → caption band, black/frozen frames, flash captions, loudness → −14 LUFS | `critic.py` | ✅ past reels were −17 LUFS (too quiet) — now fixed |
| Incremental render: per-scene fingerprints, cached pieces joined without re-encode | `render_incremental.mjs` | ✅ frame-exact joins; ⚠️ first render 1.6× slower (11 m vs 7 m) — speed-up only on re-renders |
| Phone delivery: plain MP4 links | `phone_link.sh` | ✅ |
| Web page: password, private uploads (Vercel Blob), Make, My videos | `studio-web/` | ✅ built + mock-tested; deploy steps in `studio-web/README.md` |

## Known issues / next fixes
- First render via the incremental renderer is slower → render once, split into cached pieces.
- Urdu cloned voice (OmniVoice) takes 60+ min per reel on CPU — biggest pain point.
- The "d" fix (Urdu punctuation) is pushed but not yet confirmed by listening to a new Urdu reel.
- Web page not yet deployed end-to-end (needs the Vercel account, Blob store with read-write token, GitHub token).

## Roadmap (user's priority order, 2026-11-17)
1. **Foundation** — own media + voiceover ✅ done.
2. **Core** — self-check loop ✅ (add: vision-AI pass, contrast, text off-screen) · instant variants (hook variants,
   re-use unchanged voice lines) · Urdu–English best-in-class · music to the story ✅.
3. **Table stakes, made first-class** — reference-reel style copy, chat editing, motion graphics from facts.
4. **Later** — edits following voice emphasis; photo → 3D walk-in (from the world model).
5. **Never** — "editor learns your taste".

## Deep-tech directions discussed (not started)
| idea | one-line | closest prior art |
|---|---|---|
| Optimisable video compiler | gradient descent on the edit program's numbers (timing, positions, motion) against quality goals | DiffVG (2020) for vector graphics; not found for video edits |
| Self-teaching decompiler | any reel → our edit program; trained on unlimited renders of our own programs; failures → new scene types | Edit3K, OmniLottie, editing-style transfer (partial) |
| Elastic time | the video stretches to fit any voice (dubbing, voiceovers) instead of squeezing the voice | dubbing tools squeeze speech; re-timing the video not found |
| Facts with receipts | every on-screen number tied to its source sentence; build refuses unsourced numbers; rendered frames verified | grounding research (partial) |
| Screen time ∝ information | time and emphasis follow how much each line adds | not found as an edit objective |
| Simulated viewer | model of the viewer's eyes; the editor compiles to "eye trace" | Watch to Edit (2018, real gaze) |
| Edit real footage like code | real video → layers + camera + timing as an editable program | Generative Omnimatte (layers only) |
| Studio invents scene types | motion algebra + program search + render verification; library grows itself | MoVer, Code2Video (partial) |
| Story Worlds | script → 3D world, camera choreographed to narration (needs the world model) | World Labs Memory House (manual) |
| Own models | decompiler model (free synthetic data), own director model (no Groq limits), viewer model | — |

## Facts to remember
- Repo is PUBLIC: anything in `studio/projects/` and the reels release is public; web uploads are private and auto-deleted.
- Remotion license: free only for companies ≤3 people. Vercel Hobby = non-commercial (move to Pro / Cloudflare when it's a business).
- GitHub free runners must not render paying customers' videos (terms) — move rendering to a paid server then.

## 2026-11-18 — "d"/"b" after every sentence: found and fixed · Pace control
- **Diagnosis (measured, not guessed):** spectrograms of the last 300 ms of each line in reel web-44333673386 show the
  voice engine (OmniVoice) ending every line in creaky voice: 2–3 sharp, isolated glottal pulses after the last vowel.
  An isolated pulse after a vowel is heard as a stop consonant ("d"/"b"). Not the script (Urdu punctuation was already
  converted), and not our joining (the pulses sit ~100 ms before the cut).
- **Fix:** `clean_edges()` in narrate.py: real speech = loud enough AND low crest (a lone pulse has a very high
  peak/RMS); cut 15 ms after it, tame any pulse left in the last 150 ms, 8 ms fade-in / 40 ms fade-out.
  Synthetic test: tail peak 0.25 → 0.06 (same as a clean ending), vowel untouched. The log prints how many endings it cleaned.
- **Quality:** OmniVoice back to 32 steps (makers' default). Voice cache key changed → old cached lines re-made once.
- **Pace** (page + all studio workflows, default **fast**): normal 1.08× / pauses ×1 · fast 1.2× / pauses ×0.55 ·
  turbo 1.32× / pauses ×0.35. Uses each engine's own speed control (natural pitch); the Chatterbox clone has none,
  so it gets a pitch-preserving ffmpeg atempo.

## 2026-11-18 — Media choice: what the video is made of
Page section "2 · Photos & clips" → *What the video is made of* (BG_MODE): `video`/`photo` = my media + animations +
stock (as before) · `off` = my media + animations, **no stock and no AI images** (scene image slots use their designed
no-image look) · `mine` = **only my media** in every scene: per-scene pick by meaning minus recency (never the same asset
twice in a row) minus wear; a clip returns as a different, non-overlapping high-interest window; a photo returns with a
different camera move (`bgMove`: in/out/left/right in bgmedia.tsx). No uploads + `mine` → falls back to `off`.
Tested on projects/demo (4 assets → 22 scenes, clip windows 36/33/26/40/15/12 s, photo moves rotate). preview.js rebuilt.

## 2026-11-21 — "d/b" after lines: root cause in the voice SAMPLE piece
- OmniVoice clones from an 8 s piece of voice/<name>.wav. The old picker cut it at a fixed 8 s length, so
  it started and ended **mid-word** for every voice (last 50 ms only 8–14 dB below speech). The clone copies
  that chopped ending → a stray consonant ('d'/'b') after lines; the end-cleanup only hid part of it.
- New `pause_bounded_window`: the piece (5–10 s, most fluent) now starts and ends in the middle of a real
  pause (≥120 ms). Edges now 45–65 dB below speech for all 5 voices. 10 ms fades on the piece.
- OmniVoice voice-cache key gets ":pausewin", so lines are synthesized again with the new piece (one slow run).
- Same fix for the English engine (Chatterbox): it was given the whole file and listens to its first ~6 s,
  which also cut mid-word for 4/5 voices. It now gets a 4–6 s pause-bounded piece (cache re-keyed too).

## 2026-11-21 — dead air regression (my bug) fixed
- The pause-bounded sample piece was cut in the MIDDLE of pauses → up to ~0.5 s of silence at each edge.
  OmniVoice read the speaker as slow: run 44799517194 = 182.7 s reel, 88 pauses ≥0.3 s (40.6 s of dead air)
  vs 22 pauses / 8 s before.
- Now: the piece is cut at pause EDGES (40–60 ms of silence each side, measured on all 5 voices) and pauses
  inside the piece are shortened to 0.15 s, so the clone learns a quick rhythm.
- Safety net `tighten`: every line's internal silences are capped by pace (normal 0.24 s / fast 0.16 s /
  turbo 0.11 s, 10 ms cross-fade). Logged as "long pauses inside lines shortened". Cache re-keyed ":pausewin2".

## 2026-11-21 — voice lost its emotion (my regressions) → expressive delivery
User: "no emotion, just fluent". Causes (all from the last 2 days): (1) voice-sample piece chosen as the
smoothest stretch and its pauses squeezed to 0.15 s → the clone copied a rushed flat rhythm; (2) pause cap
inside lines 0.16 s killed the breath before punchlines; (3) "fast" = 1.2x speed flattens pitch movement.
Fix: piece = most EXPRESSIVE fluent stretch between pauses (YIN pitch range in semitones, octave-error
guarded, + loudness dynamics, minus hesitation): sabeha 7.6→9.0 st, saher 7.0→10.0 st, voice_ref
6.0→7.6 st / 2.5→3.9 dB (sufyan, pariya: short samples, unchanged). Piece keeps natural pauses (only
>0.35 s shortened). Pause cap inside lines: normal 0.42 / fast 0.32 / turbo 0.22 s. Pace speeds: normal
1.05, fast 1.12, turbo 1.25. Cache re-keyed (":expr1").
