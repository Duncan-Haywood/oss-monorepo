# capture-realaudio: does the audio-sync threshold found on synthetic noise hold on real recorded sound?

Track 13 (autonomous multi-angle capture), a follow-up to `capture-audiosync`, whose headline ("2 s windows sync two cameras from -10 dB SNR") was measured on synthetic speech-like noise. This project reruns the same GCC-PHAT estimator on 10 real recordings and sound effects. **Headline:** the synthetic threshold does not carry over. With 2 s windows and white noise, the share of windows more than one 30 fps frame (33 ms) off is 0.00 on synthetic audio at -10 dB SNR, but 0.53 on average over the real clips (0.00 for applause, 0.95 for `falling`); at 0 dB it is 0.00 vs 0.26. Wind-like (brown) noise at the same total SNR is easier (0.20 at -10 dB), since PHAT's 100 to 4000 Hz band sees less of it. Clips with narrow spectra fail first, and **partial whitening** (dividing the cross-spectrum by |C|^gamma, gamma = 0.25 instead of PHAT's 1) cut the failure share from 0.52 to 0.28 at -10 dB and from 0.24 to 0.01 at 0 dB. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/capture-realaudio/

**Builds on.** `capture-audiosync` (its estimator is imported unchanged) and Knapp and Carter (1976), "The generalized correlation method for estimation of time delay", *IEEE Trans. ASSP* 24(4), which introduces the family of weightings that PHAT and plain correlation belong to. The partial-whitening exponent is a one-line variant of that family, not a method from a paper I could cite. No CU Boulder group in `prompt.md` covers this and none is claimed.

## What is and is not real
The source audio is real: the 10 clips of at least 3.9 s among the sound files installed with LibreOffice (`/usr/lib/libreoffice/share/gallery/sounds`, read at run time, **not copied into this repository**; the experiment lists the clips it found in `results.txt`). They are sound-gallery effects and short recordings (applause, a spoken line, a gong and so on), recorded at 11 or 22 kHz, so none has energy above 5.5 kHz; they are **not** field recordings from a travel shoot and not wind-contaminated speech. The inter-camera delay is still simulated (FFT phase ramp), the noise is synthetic (white, or brown noise above 20 Hz as a stand-in for wind rumble, not a recorded wind), and there is no reverb, codec or clock drift. Only the per-window delay estimate is tested, not the line fit.

| input | value | source |
|---|---|---|
| Source clips | 10 real clips | LibreOffice gallery on the run machine |
| Window | 2 s | as `capture-audiosync` |
| Delay | uniform in [0.2, 0.8] s | 0.8 s is `capture-audiosync`'s assumed hand-start offset |
| SNR | total signal over total noise power, per camera | swept |
| Frame | 33.3 ms | the "synced" criterion of `capture-audiosync` |
| Trials | 20 per clip per cell, random start in the clip | windows from one clip overlap, so they are not independent |

## Method (`src/capture_realaudio/real.py`)
Clips are resampled to 16 kHz and peak-normalised. A window of 2 s (plus 0.5 s of guard each side) is cut at a random start; camera B gets it delayed by tau; each camera adds independent noise at the stated SNR. The delay is estimated by GCC with weighting 1/|C|^gamma (gamma = 1 is PHAT and is tested to equal `capture_audiosync.gcc_phat`), band 100 to 4000 Hz, parabolic peak interpolation. `spectral_stats` gives each clip's spectral flatness in the band and the share of 50 ms frames within 30 dB of the loudest.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-realaudio
python -m pytest -q tests                       # 7 tests (2 skip if the LibreOffice sounds are absent)
PYTHONPATH=src:../capture-audiosync/src python experiments/run.py   # about 1.5 min; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Share of 2 s windows more than one frame off, white noise except where stated (10 clips, 20 trials each; synthetic = 60 trials):

| SNR (dB) | synthetic (audiosync source) | real, mean over clips | real, worst clip | real, wind-like noise, mean |
|---|---|---|---|---|
| -15 | 0.33 | 0.81 | 1.00 | 0.35 |
| -10 | 0.00 | 0.53 | 0.95 | 0.20 |
| -5 | 0.00 | 0.36 | 0.95 | 0.09 |
| 0 | 0.00 | 0.26 | 0.80 | 0.04 |
| 10 | 0.00 | 0.02 | 0.20 | 0.01 |

- **Clips differ enormously.** At -10 dB `applause`, `roll` and `romans` never fail; `falling`, `space2`, `untie` and `wallewal` fail 90 to 100% of windows. Broadband, noise-like content (applause) syncs best, as the synthetic case suggested, and tonal or synthesised content is worst.
- **Some failures are gross, not marginal.** At 0 dB `space2`, `untie` and `wallewal` have median errors of 380 to 610 ms, i.e. the peak locks onto a wrong lag (plausibly periodic content; I did not test why). Where a window is found the error is small: median 0.003 ms, 95th percentile 6.7 ms (pooled at 0 dB, 74% of windows), against 0.002 ms for synthetic.
- **Spectral flatness alone does not predict failure.** The two most tonal clips (`space2` 0.001, `untie` 0.002) fail 0.90, but `applause` (0.085) and `roll` (0.107) pass while `drama` (0.098) fails 0.75. I report the flatness column but draw no rule from 10 clips.
- **Partial whitening lowers the mean failure share at every SNR tested.** Mean failure share over clips, white noise, 2 s:

| SNR (dB) | PHAT (1.0) | 0.75 | 0.5 | 0.25 | plain correlation (0) |
|---|---|---|---|---|---|
| -15 | 0.73 | 0.69 | 0.64 | 0.56 | 0.49 |
| -10 | 0.52 | 0.42 | 0.37 | 0.28 | 0.25 |
| -5 | 0.38 | 0.29 | 0.18 | 0.11 | 0.10 |
| 0 | 0.24 | 0.11 | 0.04 | 0.01 | 0.01 |
| 10 | 0.03 | 0.00 | 0.00 | 0.00 | 0.01 |

Plain correlation is as good as gamma 0.25 here; I would not recommend it generally, since correlation peaks widen with reverberation, which PHAT was designed for and this project does not test. PHAT's equal weight on bins with no signal is the likely cost on band-limited clips, but this project did not isolate that cause.

## Limitations
Ten clips from one sound gallery; most are effects rather than ambient audio; trials within a clip overlap; synthetic delay and noise; no reverb, so the case where PHAT is expected to win is absent; the per-clip table has 20 trials per cell, so shares are multiples of 0.05. Failure share on real audio of a travel shoot may be better or worse. A pooled number hides that the outcome depends strongly on the clip.

## Next steps
- Run on real ambient recordings (a CC-licensed field-recording set) and on owner clips, with real wind.
- Add reverb and compare gamma again; pick gamma per window by peak-to-sidelobe ratio.
- Use 5 s windows for tonal content and test whether the failure cuts as in `capture-audiosync`.

## Owner steps
Record a clap on two owned cameras (see `capture-audiosync`) and share a short ambient clip pair for the real test.

## Outside dependencies
Python, NumPy, pytest, `capture-audiosync` (imported), and the LibreOffice gallery sounds on the machine that runs it.
