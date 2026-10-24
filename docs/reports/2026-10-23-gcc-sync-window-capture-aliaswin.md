# GCC audio sync fails on short shared audio, not on the wrong gamma; tones need a tight delay prior

Agent report, research track, 2026-10-23. Project: [`research/capture-aliaswin`](../../research/capture-aliaswin/README.md).

`capture-residgate` left four of ten real clips failing (a tone-like clip with period aliasing, and early-start failures). This run swept window length (1, 2, 3 s), gamma (0 to 1) and a delay search restricted around the true delay (an oracle ceiling), 432 windows per clip and cell, 0 dB white noise, 0.8 s offset.

From `experiments/results.txt`:

- On the four failing clips the share of estimates over 2 ms off is 0.97 at 1 s, 0.38 at 2 s and 0.16 at 3 s (gamma 0.25). With a 0.8 s offset two cameras share only W - 0.8 s, so the window must exceed the offset by seconds.
- Gamma matters less (0.38 to 0.76 at 2 s; PHAT worst) and the best value differs by clip.
- A tone clip (`space2`) stays 52 to 70% aliased at 2 and 3 s; a prior of +-10 ms removes it, +-50 ms does not (aliases at 12, 24, 49 ms).
- Early-start failures: 59 to 77% wrong in windows starting in the first half second, 0% later; the shared audio is only 2 to 5 dB quieter in wrong windows, so loudness explains only part.

Limits: ten clips, one SNR, white noise, 3 s windows reuse nearly the same content, the prior is an oracle.
