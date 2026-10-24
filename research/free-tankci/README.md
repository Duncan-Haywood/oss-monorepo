# Is the overflow twin really better than the black boxes on the real two-tank rig? Yes: the 0.13 V gap over ARX 4/4 has a 95% block-bootstrap interval of 0.06 to 0.20 V at every block length tried

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/free-tankci/

A free-choice follow-up to [`free-tanktwin`](../free-tanktwin), whose README lists "a bootstrap over blocks of the test trace for an interval on the twin-vs-ARX gap" as its first limitation. That project reported 0.53 V (overflow twin) against 0.66 V (best black box) on the real Cascaded Tanks rig with no uncertainty. The test errors are strongly autocorrelated, so an ordinary bootstrap would be over-confident; this project puts an interval on the gap with a moving-block bootstrap and sweeps the block length instead of choosing one. Relates to the sim-to-real and system-identification themes of ARPG and CAIRO; no lab code is reused. Produced with AI assistance (Claude).

## Data

No new measurements. The inputs are the held-out predictions of all seven models and the measured output, committed by `free-tanktwin` in `../free-tanktwin/experiments/test_pred.npy` (data: Schoukens et al. 2016, *Cascaded tanks benchmark combining soft and hard nonlinearities*). The first 50 samples are skipped as in that project, leaving 974 samples at 4 s. A test checks that the stored predictions reproduce the published RMSEs (0.528 V and 0.655 V).

## Method

Statistic: `RMSE(other) - RMSE(overflow twin)`, computed on the same resampled indices for both models (paired). Resampling: circular moving blocks of length L, 4,000 resamples, 95% percentile interval, fixed seed. L = 1 is the ordinary iid bootstrap. The integrated autocorrelation time of the twin's test error is 41 samples (ARX 4/4: 37, no-overflow twin: 37), so blocks of 25 to 100 are the relevant range and L = 1 is shown only as the over-confident reference.

## Results (`experiments/results.txt`, figure `experiments/gap_ci.png`)

| other model | gap (V) | 95% interval, L = 1 | L = 25 | L = 50 | L = 100 | L = 200 |
|---|---|---|---|---|---|---|
| linear ARX 4/4 (9 params) | 0.126 | 0.104 to 0.150 | 0.060 to 0.200 | 0.061 to 0.194 | 0.076 to 0.178 | 0.093 to 0.163 |
| twin without overflow (6) | 0.130 | 0.108 to 0.154 | 0.067 to 0.203 | 0.069 to 0.196 | 0.075 to 0.193 | 0.081 to 0.188 |
| linear ARX 2/2 (5) | 0.187 | 0.165 to 0.210 | 0.109 to 0.265 | 0.097 to 0.265 | 0.103 to 0.260 | 0.117 to 0.244 |

- The overflow twin's advantage survives: no interval at any block length includes zero, and no resample had a gap at or below zero (P(gap <= 0) = 0.000 at 4,000 resamples).
- Autocorrelation matters: moving from L = 1 to L = 25 to 50 widens the ARX 4/4 interval from 0.046 V to about 0.14 V, roughly three times. The iid interval in the first column would have overstated the certainty.
- The gap to the 6-parameter twin without overflow is about as large as the gap to the black boxes, so the earlier statement that the no-overflow twin "ties" ARX 4/4 and that the overflow term carries the gain holds up: those two models differ by 0.004 V in point RMSE.

## Limitations

- This resamples one test trace of one rig. It quantifies uncertainty from which stretch of the test run is drawn, not from a different input realisation, a different rig or different fitting randomness. The models were fitted once; fit variance is not in the interval.
- Block bootstrap on 974 samples with an autocorrelation time of about 40 gives only about 24 effective independent blocks; percentile intervals at that size can undercover. The 95% label is nominal. The unit test checks that the interval covers the true gap in at least 34 of 40 iid synthetic trials (nominal 38), not that it is exact for this series.
- The NARX 3/3 and 4/4 models diverged in free run in `free-tanktwin` and are not compared here; the unresolved question of a simulation-error NARX fit remains open. The Cascaded Tanks data could not be downloaded in this run (the `nonlinear-benchmarks` install failed in the session), so nothing was refitted.
- The overflow twin's spill gain sits near its fit bound (see `free-tanktwin`), so the model itself is a tuned closure.

## Reproduce

```
PY=$(python3 platform/ci/pyenv.py pytest numpy scipy matplotlib)
"$PY" -m pytest -q research/free-tankci/tests
"$PY" research/free-tankci/experiments/run.py      # seconds; reads the committed predictions
"$PY" research/free-tankci/experiments/figure.py
```

## Next steps

- Refit twin and ARX on resampled training segments to add fit variance to the interval.
- Refit the NARX models by simulation error and add them to the comparison.
- Repeat on a second public rig (for example the Silverbox or Wiener-Hammerstein benchmarks in `nonlinear-benchmarks`).

## Outside dependencies
numpy and matplotlib. Data and predictions come from `free-tanktwin`.
