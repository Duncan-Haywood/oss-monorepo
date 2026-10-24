# capture-audiosync: how long a window of sound does it take to sync two drifting cameras, and how often must you redo it?

Track 13 (autonomous multi-angle capture), a follow-up to `capture-edit`, whose pipeline assumed the cameras' clocks were already lined up. Two cameras that never shared a clock disagree by a start offset plus a drift of tens of parts per million; the common fix is to line them up by the sound they both heard. **Headline:** on synthetic speech-like audio, a GCC-PHAT estimate per window followed by a robust line fit synced two cameras to under 0.02 ms over a 1 h span (40 ppm drift) with 2 s windows down to -10 dB SNR, and 5 s windows down to -15 dB. Below those SNRs it fails completely (the false peak is around 1 s off), with a narrow band in between. A sync made once at the start is not enough: 40 ppm drifts one 30 fps frame (33.3 ms) in 833 s, so 144 ms after an hour. Added reverb with the direct sound 5 dB below the reverberant tail costs nothing at 0 dB SNR, but at -10 dB direct-to-reverberant it adds a 4 to 5 ms error. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-audiosync/

**Builds on.** `capture-edit` (which needs synced clips). The method is generalised cross-correlation with phase transform: Knapp and Carter (1976), "The generalized correlation method for estimation of time delay", *IEEE Trans. ASSP* 24(4). The Theil-Sen line is Sen (1968), *J. Amer. Statist. Assoc.* 63. No CU Boulder group in `prompt.md` covers this and none is claimed.

## What is and is not real
All audio is synthetic: Gaussian noise low-passed at 4 kHz with a 3 Hz amplitude modulation (speech-like, not speech), one shared source, independent white noise on each camera, optional exponentially decaying reverberant tails. **No real footage was used**, no real camera clock was measured, and the simulated delay is exact (FFT phase ramp), so errors of 0.00 ms mean "below the 0.005 ms the table shows", not that real cameras sync perfectly. Real wind noise is not white, real sources move, and real drift is not perfectly linear (temperature). The ppm values (10 to 100) are swept, not sourced: no camera datasheet I could reach states a figure. The analytic part is checked: offset-only error equals ppm x span exactly (table below).

| input | value | status |
|---|---|---|
| Start offset | 0.8 s | assumed (about the delay of starting two recordings by hand) |
| Clock error | 10, 20, 40, 100 ppm | swept; none sourced |
| Frame | 33.3 ms (30 fps) | the criterion for "synced" |
| Sampling | 16 kHz, band 100 to 4000 Hz for the PHAT weighting | choice |
| Speech-like source, noise SNR, reverb RT60 0.4 s | see Method | synthetic |

## Method (`src/capture_audiosync/sync.py`)
- **Per-window delay.** GCC-PHAT between the two tracks, peak by parabolic interpolation, search limited to the window length (a lag longer than the window has no overlap). The PHAT weight is zeroed outside 100 to 4000 Hz: whitening bins where there is no signal turned a clean case into noise in the first test.
- **Track.** 12 windows spread over 1 h (the true delay is 0.8 s + ppm x t), then a Theil-Sen line (median of pairwise slopes) so a minority of false peaks cannot move it.
- **Scores.** Share of single windows off by more than one frame; the worst error of the fitted line over the hour; the worst error of syncing once at the first window and never again.
- 10 seeds per cell, deterministic.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-audiosync
PYTHONPATH=src python -m pytest -q tests     # 9 tests
PYTHONPATH=src python experiments/run.py     # a few minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Share of single windows more than one frame off, 40 ppm, no reverb (start offset 0.8 s, so 0.5 s windows cannot overlap the two tracks at all and always fail):

| SNR (dB) | 1 s | 2 s | 5 s | 10 s |
|---|---|---|---|---|
| -20 | 1.00 | 0.99 | 0.90 | 0.46 |
| -15 | 1.00 | 0.68 | 0.00 | 0.00 |
| -10 | 1.00 | 0.00 | 0.00 | 0.00 |
| -5 | 0.48 | 0.00 | 0.00 | 0.00 |
| 0 | 0.18 | 0.00 | 0.00 | 0.00 |
| 10 | 0.08 | 0.00 | 0.00 | 0.00 |

- **A threshold, not a slope.** Where the peak is found the fitted error is below 0.02 ms; where it is not, the line is wrong by about a second. The 1 s windows fail at low SNR because only 0.2 s of the two tracks overlap at a 0.8 s offset: a longer window than the offset is needed, or a coarse offset first.
- **Drift needs a fit.** Offset-only error after 1 h equals ppm x 3600 s (36, 72, 144, 360 ms for 10, 20, 40, 100 ppm). One frame is passed after 3,333, 1,667, 833 and 333 s.
- **Reverb.** With 2 s windows, direct-to-reverberant ratio down to -5 dB at SNR 0 or higher is harmless (0.01 ms). At -10 dB it adds 4 to 5 ms median error (95th percentile up to 8 ms). At SNR -10 dB reverb at 0 dB DDR starts to fail (22% of windows) and -5 dB fails outright.
- **Window count.** At -10 dB SNR with 2 s windows even 3 windows suffice, because no window failed there; the 12-window figure is not needed in this case. Its value would show at SNRs where some windows fail (a few, not most), which this sweep does not isolate.

## Limitations
Synthetic audio and exact delay (above). One shared source and one delay: real cameras several metres apart hear it at about 3 ms per metre (speed of sound 343 m/s), which the fit absorbs as offset but which differs by source position when the subject moves. No codec effects, no automatic gain, no clipping. A real test on an owner trip clip is the first next step.

## Next steps
- Run the same estimator on a real two-camera clip pair with a hand clap and a loud, wind-heavy section, and report the measured drift.
- Coarse-to-fine search so windows shorter than the start offset work.
- Feed synced clips to `capture-edit` and measure whether a 5 ms residual changes cut quality (it should not).

## Owner steps
Record a clap on two owned cameras at the start and end of a long take to get their real drift in ppm.

## Outside dependencies
Python, NumPy, pytest. No real recordings.

Follow-up: [`capture-syncfine`](../capture-syncfine) tried the coarse-offset-first idea; 0.5 s windows then sync from -12 dB SNR.
