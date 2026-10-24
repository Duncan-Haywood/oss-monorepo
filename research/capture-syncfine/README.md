# capture-syncfine: does finding the start offset first let short audio windows sync two drifting cameras at lower SNR?

Track 13 (autonomous multi-angle capture), the first "next step" of `capture-audiosync`: its windows were cut at the same time on both cameras, so a 0.8 s start offset left a 1 s window only 0.2 s of overlap and a 0.5 s window none. **Headline (synthetic audio):** estimating the offset once from a 10 s window and cutting every later window on camera B that much earlier lets 0.5 s windows sync a 40 ppm drift over an hour to within one 30 fps frame (in fact 0.01 ms) at -12 dB SNR, where plain 0.5 s windows never work and plain 1 s windows fail at every SNR up to -5 dB. At 0 dB with 1 s windows it moves the success rate from 0.95 to 1.00, and with reverb (RT60 0.4 s, direct-to-reverberant 0 to -10 dB) from 0.00 to 1.00. It does not buy range at the bottom: at -20 dB the coarse step itself fails in 20% of seeds, and everything fails. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/capture-syncfine/

**Builds on.** `capture-audiosync` (imported, not copied: GCC-PHAT, Theil-Sen fit, synthetic audio), Knapp and Carter (1976), *IEEE Trans. ASSP* 24(4), and Sen (1968), *J. Amer. Statist. Assoc.* 63. No CU Boulder group covers this.

## What is and is not real
All audio is synthetic and the delay exact, as in `capture-audiosync`; **no real footage or camera clock was used**. The shifted window is simulated as a window with the residual delay (`tau - d_hat`) rather than by cutting a long recording, which is equivalent for whole-sample cuts and ignores the sub-sample remainder. 40 ppm and 0.8 s are assumed, as there. The 10 s coarse window and 12 windows are my choices.

## Method (`src/capture_syncfine/fine.py`)
1. Coarse: GCC-PHAT on one 10 s window at t=0, lag search up to 5 s.
2. Fine: each of 12 windows over 1 h is estimated on the residual and added to the coarse offset, then a Theil-Sen line is fitted. "ok" = fitted line within 33.3 ms (one frame) of truth at all 12 times.
3. 20 seeds per cell. The coarse step alone is scored too (`coarse_step_ok`: within one frame).

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncfine
python -m pytest -q tests                 # 5 tests (pythonpath includes ../capture-audiosync/src)
PYTHONPATH=src:../capture-audiosync/src python experiments/run.py   # a few minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Share of 20 seeds with the fitted line within one frame (no reverb):

| SNR (dB) | 0.5 s plain | 0.5 s coarse-fine | 1 s plain | 1 s coarse-fine | 2 s plain | 2 s coarse-fine |
|---|---|---|---|---|---|---|
| -17 | 0.00 | 0.00 | 0.00 | 0.10 | 0.00 | 0.75 |
| -15 | 0.00 | 0.05 | 0.00 | 1.00 | 0.15 | 1.00 |
| -12 | 0.00 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 |
| -5 | 0.00 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 |
| 0 | 0.00 | 1.00 | 0.95 | 1.00 | 1.00 | 1.00 |

- **Cost.** Audio needed: 12 x window plus 10 s. For 1 s windows at -15 dB that is 22 s, against 24 s for plain 2 s windows, which succeed only 15% of the time there.
- **Threshold shift.** The success threshold for 2 s windows moves from about -12 dB to about -17 dB, and for 1 s windows from above 0 dB to -15 dB.
- **Reverb** (1 s windows, 0 dB SNR): plain 0.00 at every direct-to-reverberant ratio tried (0, -5, -10 dB); coarse-fine 1.00. Part of the plain failure is the missing overlap, not reverb, so this is not a reverb effect.
- **Floor.** At -20 dB the coarse step is right in 80% of seeds but the fine windows still fail: the offset is not the limit there.

## Limitations
Synthetic, exact delay, one source, white noise (see `capture-audiosync`). The comparison favours coarse-fine partly because the plain design wastes overlap; a fairer plain baseline would use a window longer than the offset, which is what 2 s windows are. One long window is a single point of failure: a wrong coarse offset by more than the window would break every later window (it was right in 80 to 100% of seeds at -20 to -17 dB here).

## Next steps
Real clap-and-clip pairs; re-estimating the offset from the running fit instead of once; feeding the result to `capture-edit`.

## Owner steps
Record a clap on two owned cameras at the start and the end of a long take.

## Outside dependencies
Python, NumPy, pytest, `capture-audiosync`. No real recordings.
