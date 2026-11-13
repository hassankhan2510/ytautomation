# Encrypted voice reference

`voice_ref.wav.enc` is the creator's cleaned voice sample (24 kHz mono WAV), encrypted with
AES-256-CBC (PBKDF2, 200k iterations). The repo is public, so the raw voice is never committed.

Renders decrypt it in memory with the `VOICE_KEY` repository secret:

```
printf '%s\n' "$VOICE_KEY" > /tmp/vk
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in voice/voice_ref.wav.enc -out /tmp/voice_ref.wav -pass file:/tmp/vk
```

Raw recordings + the key stay local in `voice-raw/` (git-ignored).
