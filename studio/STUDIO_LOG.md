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
