# capture-realedit: does an automatic multi-camera edit survive the sync errors measured on real recorded clips?

Track 13 (autonomous multi-angle capture), closing the second "Next steps" item of `capture-syncedit` ("run the edit with sync errors from `capture-realaudio`'s real clips"). `capture-syncedit` found that, on synthetic speech-like audio, a robust fit leaves no cut damaged down to -10 dB SNR. **Headline:** on 10 real recorded clips that does not hold. With the same edit, the same clocks and a 12-window Theil-Sen fit of 2 s GCC-PHAT windows, the mean share of cuts that jump over one 30 fps frame is **0.34 at 0 dB SNR and 0.64 at -10 dB** (synthetic: 0.00 at both), and 4 of 10 clips lose 62 to 97% of their cuts at 0 dB. The failure is per clip, not per SNR: `applause`, `roll` and `romans` stay at 0.00 down to -10 dB. **Partial whitening** (dividing the cross-spectrum by |C|^0.25 instead of PHAT's |C|) cuts the 0 dB mean to **0.014**, and the worst clip to 0.105. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-realedit/

**Builds on.** `capture-syncedit` (edit, clock model and cut-damage counts, imported unchanged), `capture-realaudio` (real-clip windows and the partial-whitening estimator), `capture-audiosync` (Theil-Sen fit) and `capture-edit` (Viterbi edit). Partial whitening is the one-line variant of the generalized correlation family of Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4), as in `capture-realaudio`. No CU Boulder group in `prompt.md` covers this and none is claimed.

## What is real and what is not
Real: the audio, 10 clips of at least 3.9 s from the sound gallery installed with LibreOffice (`/usr/lib/libreoffice/share/gallery/sounds`, read at run time, not copied here). They are effects and short recordings at 11 or 22 kHz, not travel-shoot field audio. Not real: the inter-camera delay (an exact FFT phase ramp), the noise (white, independent per camera), the clock rates (uniform in +-40 ppm, swept and unsourced, as in `capture-syncedit`), and the 0.5 loud events per second. There is no reverb, codec or wind recording, and the one-frame visibility limit is an assumption with no viewer test.

| input | value | source |
|---|---|---|
| Cameras, edit | 4, 120 s Viterbi (sigma 0.3, cut cost 1.0) at a random point of 1 h | `capture-syncedit`, `capture-edit` |
| Windows | 12 over the hour, 2 s | `capture-syncedit` |
| Clock rate, start offset | +-40 ppm, 0.8 s | `capture-syncedit` (assumed) |
| Audio | 10 real clips | LibreOffice gallery on the run machine |
| Weighting | gamma = 1 (PHAT) or 0.25 | `capture-realaudio` |
| Trials | 12 seeds per clip per cell | |

## Method (`src/capture_realedit/realedit.py`)
For each non-reference camera, each of the 12 windows is a random segment of one clip (`pair_from_clip`) delayed by the camera's true delay and noised, then estimated with `gcc_gamma`. The camera's error at the clip is a Theil-Sen line over the 12 estimates, or the first window alone ("once"). The error then goes through `capture_syncedit`'s `cut_damage`, counting cuts whose jump is over one frame and cuts with a loud event inside the jump.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-realedit
python -m pytest -q tests                     # 6 tests (1 skips without the LibreOffice sounds)
python experiments/run.py                     # about 2.5 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Mean over 10 clips of the share of cuts (white noise, 2 s windows, 12 seeds per clip):

| sync | SNR (dB) | gamma | cuts with jump over a frame | with a loud event in the jump | mean jump (ms) | worst clip, jump share |
|---|---|---|---|---|---|---|
| fit | 10 | 1 (PHAT) | 0.094 | 0.016 | 38.9 | 0.943 |
| fit | 0 | 1 | 0.342 | 0.069 | 167.8 | 0.970 |
| fit | 0 | 0.25 | 0.014 | 0.003 | 7.0 | 0.105 |
| fit | -10 | 1 | 0.637 | 0.135 | 320.6 | 0.960 |
| fit | -10 | 0.25 | 0.476 | 0.088 | 205.0 | 0.967 |
| once | 10 | 1 | 0.540 | 0.036 | 95.1 | 0.920 |

- **The synthetic threshold does not carry over.** `capture-syncedit` reports 0.000 for the fit at 0 and -10 dB; here 0.34 and 0.64. At 0 dB `falling`, `space2`, `untie` and `wallewal` lose 62 to 97% of cuts; at 10 dB only `space2` does (94%).
- **It is the clip, not the SNR.** `applause`, `roll` and `romans` are at 0.00 for the fit down to -10 dB. A tonal or narrow-band stretch is what puts a wrong peak in more than half of the 12 windows, so the Theil-Sen fit stops being able to outvote it.
- **Partial whitening rescues 0 dB** (0.34 to 0.014; only `soft` 0.03 and `untie` 0.11 remain) but not -10 dB (0.64 to 0.48), where `falling` is no better (0.97) and `space2` stays at 0.94.
- **Syncing once is worse on real audio**: 0.54 against 0.50 on synthetic, because a bad first window (`space2`: 0.92) is never corrected. The other nine clips give 0.498 exactly, the drift alone.

## Limitations
Ten clips from one gallery, most of them effects; 12 seeds per cell, so a per-clip share is noisy (cuts per edit are few); synthetic delay and noise; no reverb, where PHAT is expected to do better against plain correlation; clips are short, so windows from one clip overlap and are not independent estimates of a long shoot; gamma = 0.25 was picked in `capture-realaudio` on these same clips, so its advantage here is in-sample. The events and one-frame criterion are assumptions inherited from `capture-syncedit`. A pooled number hides the dependence on clip.

## Next steps
- Choose gamma on some clips and test on others (the in-sample caveat above).
- Add a confidence gate (peak-to-sidelobe ratio) so a window the estimator doubts is dropped before the fit, and count cuts again.
- Replace the gallery with openly licensed field recordings of a shoot, with real wind.

## Owner steps
Record a hand clap on two owned cameras at the start and end of a long take, outdoors, to get real clips and real drift.

## Outside dependencies
The 10 clips come from the LibreOffice install; the delay, noise and clocks are simulated here.
