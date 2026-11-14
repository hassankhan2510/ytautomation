# Voice reference

`voice_ref.wav` is the creator's cleaned voice sample (40 s, 24 kHz mono; highpass, light denoise,
loudness-normalised). `scripts/narrate.py` clones it with Chatterbox (MIT) to read every script.

To change the voice: replace `voice_ref.wav` with a new clean 20-60 s recording (WAV, quiet room).

## More speakers
Each extra cloned voice is `voice/<name>.wav` (same cleaning), picked in the "Make Reel" dropdown as
`mine-<name>` (English, Chatterbox) or `omnivoice-<name>` (Urdu + English). Current: `sufyan.wav`
(Sufyan, 18.6 s; 20-60 s gives a steadier clone). Clean a new one with:
`ffmpeg -i raw.m4a -af "highpass=f=80,afftdn=nf=-25,loudnorm=I=-18:TP=-1.5:LRA=11" -ar 24000 -ac 1 voice/<name>.wav`
then add `mine-<name>` / `omnivoice-<name>` to the `voice` options in `.github/workflows/studio-make.yml`.
