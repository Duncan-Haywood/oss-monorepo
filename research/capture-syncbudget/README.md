# capture-syncbudget: how often must two free-running cameras be re-synced by audio, and does rejecting wild estimates help?

Track 13 (autonomous multi-angle capture), a follow-up to `capture-audiosync` and `capture-syncfine`, which measured how accurate one sync is. This one asks the schedule question: given a viewer tolerance, how long may a sync go unrefreshed, and what happens when a fresh window returns a false peak? **Headline:** at 40 ppm of relative clock error an offset-only sync leaves a 40 ms tolerance after 1000 s, so even a perfect estimate every 1800 s leaves the cameras out of tolerance 44% of a shoot. Re-syncing every 300 s with 2 s windows and refusing estimates that a real clock could not have produced (a *drift gate*) cut the out-of-tolerance share from 35% to 22% at -12 dB SNR and from 11% to 3% at -10 dB, and cut wrongly-applied syncs from 25 to 0 per 6 h shoot at -12 dB. Past about 900 s between re-syncs the gate does nothing: a single skipped window already lets the clock drift out of tolerance. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-syncbudget/

**Builds on.** `capture-audiosync` (the GCC-PHAT estimator and audio model, imported from its `src/`) and `capture-syncfine` (the long first window). The tolerance is EBU Recommendation R37 (2007), "The relative timing of the sound and vision components of a television signal": sound may lead picture by at most 40 ms and lag by at most 60 ms; ITU-R BT.1359-1 (1998) gives the wider detectability and acceptability thresholds. Both were set for a single programme's lip-sync, not for a cut between two cameras (no source I know sets that), so the 40 ms is a stand-in for "viewers may notice", not a measured limit. No CU Boulder group in `prompt.md` covers this and none is claimed.

> **Correction (`capture-syncslope`):** this project correlated the raw window while the delay grew to 1.66 s, so many of the 300 s and 900 s failures below are overlap artifacts, not noise. The 1800 s and 3600 s columns and the analytic table stand; see `capture-syncslope`.

## What is and is not real
Audio is synthetic (`capture-audiosync`'s speech-like noise, independent white noise per camera, exact fractional delay); no real recording was used. The clock error is a straight line, swept (5 to 100 ppm in the analytic table; 40 ppm in the simulation) and not sourced to a camera datasheet. Real drift varies with temperature, which a held offset handles worse than a line. The 6 h shoot, the 100 ppm bound used by the gate, 5 ms gate margin and the 0.8 s start offset are my choices.

| input | value | status |
|---|---|---|
| Tolerance | 40 ms both signs | EBU R37 lead limit, applied to both signs (the stricter); not a cross-camera cut threshold |
| Clock error | 40 ppm (simulation), 5 to 100 (analytic) | assumed, swept |
| Gate bound | 100 ppm x time since last accepted + 5 ms | choice |
| Window | 2 s per re-sync, 10 s for the first sync | choice (the first is trusted) |

## Method (`src/capture_syncbudget/budget.py`)
- Every `every_s` seconds a fresh GCC-PHAT estimate of camera B's delay is made from a 2 s window. The applied correction is *held* (offset only) until the next accepted estimate.
- **Naive:** apply every estimate. **Gated:** apply it only if it is within 100 ppm x (time since the last applied one) + 5 ms of that one; otherwise keep the old correction.
- **Score:** share of a 6 h shoot (1 s grid) where the applied correction is more than 40 ms from the true delay, 10 seeds, deterministic. Also the count of estimates rejected and of applied estimates that were themselves more than 40 ms wrong.
- **Ideal** column: zero-error estimates. The error then ramps 0 to ppm x every_s, so the bad share is (every_s - 1000)/every_s once every_s exceeds 1000 s.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncbudget
PYTHONPATH=src python -m pytest -q tests          # 5 tests (needs ../capture-audiosync)
PYTHONPATH=src python experiments/run.py          # about 25 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Analytic: seconds an offset-only sync stays within 40 ms, by clock error: 5 ppm 8000, 10 ppm 4000, 20 ppm 2000, 40 ppm 1000, 100 ppm 400. A 5 ms residual after syncing takes 125 s off the 40 ppm figure.

Share of the 6 h shoot out of tolerance, 40 ppm, naive / gated (ideal in brackets):

| SNR (dB) | every 300 s | every 900 s | every 1800 s (0.444) | every 3600 s (0.722) |
|---|---|---|---|---|
| -15 | 0.878 / 0.752 | 0.838 / 0.834 | 0.917 / 0.921 | 0.944 / 0.944 |
| -12 | 0.350 / 0.220 | 0.308 / 0.297 | 0.643 / 0.643 | 0.805 / 0.805 |
| -10 | 0.107 / 0.026 | 0.096 / 0.088 | 0.467 / 0.467 | 0.731 / 0.731 |
| 0 | 0 / 0 | 0 / 0 | 0.444 / 0.444 | 0.722 / 0.722 |

- **The schedule matters more than the estimator** once the SNR is workable. At 0 dB every window is exact and the only error is drift: 0 up to 900 s, 44% at 1800 s, 72% at 3600 s, equal to the ideal.
- **The gate pays only when re-syncs are frequent.** At 300 s it removed all wrongly applied syncs at -12 dB (25.2 to 0 per shoot) and cut the bad share by a third to three quarters. At 900 s the gate rejects every false peak but the share barely moves (0.308 to 0.297): one rejected window means 72 ms of drift before the next, already outside 40 ms. Re-sync at no more than half the tolerance interval (here 500 s) if a failed window must be survivable.
- **A gate cannot fix a wrong first sync.** At -17 and -20 dB even the 10 s first window fails, the gate then protects a wrong anchor, and 94 to 99% of the shoot is out of tolerance either way.
- At -15 dB most 2 s windows are false peaks (about 59 per 72 at 300 s), so the gate rejects nearly all and the held offset drifts out anyway.

## Limitations
Synthetic audio, a straight-line drift and a stand-in tolerance (above). The held offset ignores the slope: fitting a line through the accepted estimates, as `capture-audiosync` does, would lengthen the useful interval a great deal and is not tested here (the largest next-step gain). One drift bound for the gate: a true clock outside 100 ppm would be rejected as a false peak. A cut between two cameras with an offset repeats or skips action, which no source here converts into a viewer threshold.

## Next steps
- Hold the fitted slope between estimates and rerun: how long can the interval be then, and at what SNR does the line fail?
- Replace the 40 ms with a measured cut-continuity threshold from a small viewer test (owner step).
- Run on a real two-camera pair with a clap at both ends (see `capture-audiosync`).

## Owner steps
Record a clap at the start and end of a long take on two owned cameras; the measured ppm replaces the 40.

## Outside dependencies
Python, NumPy, pytest, and the sibling project `capture-audiosync`. No real recordings.
