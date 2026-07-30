# 🎬 New Video — Your Brief

Fill this in, then paste it at the bottom of `Remotion_AI_Prompt_System.md` into any AI.
This is the ONLY thing you write by hand. Everything else is automated.

```
Topic:     <what the video is about — one or two sentences of detail is great>
Style:     dark-documentary   (or: true-crime | tech-news | bright-explainer)
Duration:  6 min              (1 min | 3 min | 6 min | 10 min)
Platform:  youtube            (youtube | shorts | reels | tiktok | square)
```

### Example (this is exactly what produced the Theranos video)

```
Topic:     The rise and fall of Theranos and Elizabeth Holmes — the $9B blood-testing
           fraud, the fake Edison machine, the whistleblowers, and the trial.
Style:     dark-documentary
Duration:  6 min
Platform:  youtube
```

---

## Then run 3 commands (see `PIPELINE.md` for detail)

```bash
cd theranos-doc
npm run prepare-video   # generates AI voiceover + downloads matching assets
npm run render:youtube  # renders the final MP4
```

That's it. Topic in → finished MP4 out.
