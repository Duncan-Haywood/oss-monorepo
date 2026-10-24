# capture-syncslope: does holding a fitted clock slope between audio re-syncs let two free-running cameras go longer without a refresh?

Track 13 (autonomous multi-angle capture), the first "next step" of `capture-syncbudget`. **Headline:** with a steady 40 ppm clock error, holding a straight line fitted through the accepted audio estimates, instead of the last offset, takes the share of a 6 h shoot outside a 40 ms tolerance from 44% to 3.7% at one re-sync per 1800 s and from 72% to 12% at one per 3600 s, at every SNR from -12 dB up. All of the remainder is the first interval, before a second estimate exists to fit a slope to. The advantage disappears once the clock rate wobbles: a gate that insists on the fitted line's prediction (5 ms) locks out true estimates and leaves 69 to 88% of the shoot out of tolerance when re-syncing every 300 or 900 s with a 10 to 30 ppm temperature wobble. Restarting the fit at the second out-of-gate estimate in a row (one rejection, then a reset) repairs that at 300 s (0 to 1% bad) but at 900 s with a 30 ppm wobble the plain offset hold (13%) beats it (27%). Also a correction to `capture-syncbudget` (below). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/capture-syncslope/

**Builds on.** `capture-syncbudget` (the question, the 40 ms stand-in tolerance from EBU R37 (2007), the offset-only hold and the drift gate) and `capture-audiosync` (GCC-PHAT estimator and the synthetic speech-like audio, imported from its `src/`). No CU Boulder group in `prompt.md` covers this and none is claimed.

## Correction to `capture-syncbudget`
That project correlated the raw 2 s window while the true delay grew to 0.8 s + 40 ppm x 6 h = 1.66 s, so late in a shoot the two signals barely overlapped and GCC-PHAT failed for a reason a real system would not have: it would cut the window using the correction already in force and search only for the residual. Here the window is cut with the correction in force (`cur`), so only the residual is searched. With that change the offset-hold baseline at 300 s and 900 s re-syncs is fine from -15 dB (0.5% and 3.5% out of tolerance) where `capture-syncbudget` reported 75 to 88%. Its analytic table and its 1800 s and 3600 s columns (drift-limited, equal to the ideal) stand; its "gate pays at 300 s" result at -12 dB was mostly the overlap artifact and should not be quoted. That project's README now points here.

## What is and is not real
Audio is synthetic (`capture-audiosync`), independent noise per camera, exact fractional delay. Clock error is 40 ppm (assumed, as in `capture-syncbudget`, swept there 5 to 100 ppm analytically), optionally plus a sinusoidal rate wobble of 10 or 30 ppm over a 3600 s period standing in for temperature. No source gives a wobble for a camera oscillator; the two amplitudes are a sweep, not a measurement. The 40 ms tolerance, 5 ms gate margin, 8-point fit window and 6 h shoot are choices. No real recording was used.

## Method (`src/capture_syncslope/slope.py`)
- Every `every_s` seconds a 2 s window (10 s for the first, trusted) is cut with the current correction applied, and GCC-PHAT estimates the residual.
- **offset:** hold the last accepted estimate; accept if within 100 ppm x elapsed + 5 ms of it (`capture-syncbudget`'s gate).
- **slope:** hold the least-squares line through the last 8 accepted estimates, extrapolated. Until three are held the offset gate is used; then an estimate is accepted only within 5 ms of the line's prediction.
- **slope_reset:** as slope, but the second out-of-gate estimate in a row is accepted (trusted, like the first) and the fit history is dropped, so one estimate is rejected before a reset (`reset_after=2`; corrected 2026-10-24, the text said two rejections).
- Score: share of a 6 h shoot (1 s grid) with |applied correction - true delay| > 40 ms; 8 seeds.

## Reproduce
```bash
pip install pytest numpy
cd research/capture-syncslope
PYTHONPATH=src python -m pytest -q tests          # 5 tests (needs ../capture-audiosync)
PYTHONPATH=src python experiments/run.py          # about 15 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`, SNR -12 dB; the -10 and 0 dB rows are identical)
Share of the shoot out of tolerance, offset / slope / slope_reset:

| wobble | every 300 s | every 900 s | every 1800 s | every 3600 s |
|---|---|---|---|---|
| 0 ppm | 0 / 0 / 0 | 0 / 0 / 0 | 0.444 / 0.037 / 0.037 | 0.722 / 0.120 / 0.120 |
| 10 ppm | 0 / 0.686 / 0 | 0.021 / 0.693 / 0.009 | 0.421 / 0.043 / 0.043 | 0.759 / 0.127 / 0.127 |
| 30 ppm | 0 / 0.874 / 0 | 0.130 / 0.878 / 0.270 | 0.303 / 0.087 / 0.260 | 0.803 / 0.134 / 0.134 |

- **Slope hold is a large win on a steady clock.** At 1800 s and 3600 s the 0.037 and 0.120 are exactly the first interval's (the first interval has only one estimate): (1800-1000)/1800 over one of twelve intervals, and (3600-1000)/3600 over one of six. After that the error stays under the tolerance.
- **A tight line gate can lock itself out.** With a wobble, true estimates stray more than 5 ms from the extrapolated line, get rejected (64 of 72 at 300 s), the line goes stale and never recovers. This is a flaw in the gate as designed here, not a property of line fitting.
- **Resetting after one rejection fixes the short intervals but not the middle ones.** At 900 s a 30 ppm wobble moves a quarter of a period between estimates, a line through them extrapolates badly, and the plain offset hold wins (0.130 vs 0.270). At 1800 s slope_reset (0.260) still beats offset (0.303) narrowly.
- **SNR hardly matters here.** With the residual searched, from -12 dB up every window is right; at -15 dB a few false peaks appear (rejected 0.1 to 1 per shoot at 300 to 900 s) and move nothing much.

## Limitations
Synthetic audio, an assumed base drift and wobble, a stand-in tolerance, one gate margin, one fit length (8) and one reset rule; no robust fit (Theil-Sen or RANSAC) or Kalman filter was tried and either might remove the wobble weakness. A wrong estimate accepted by a reset is trusted. The correction applies in steps at each re-sync, which a viewer may see; this scores the error only.

## Next steps
- Try a robust fit and a model with a rate state (Kalman) against a sourced temperature-drift trace of a real camera oscillator. *Done in `capture-syncfilter`: the sourced AT-cut curve moves the rate far less than the 10 to 30 ppm wobble assumed here, and Theil-Sen and Kalman tie with least squares except on the assumed wobble.*
- Run on a real two-camera pair with a clap at both ends (see `capture-audiosync`); the measured ppm and its wobble replace the assumed ones.
- Re-run `capture-syncbudget`'s gated results with the residual search and amend that project.

## Owner steps
Record a clap at the start and end of a long take, and again an hour later, on two owned cameras.
