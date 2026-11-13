# Voice reference

`voice_ref.wav` is the creator's cleaned voice sample (40 s, 24 kHz mono; highpass, light denoise,
loudness-normalised). `scripts/narrate.py` clones it with Chatterbox (MIT) to read every script.

To change the voice: replace `voice_ref.wav` with a new clean 20-60 s recording (WAV, quiet room).
