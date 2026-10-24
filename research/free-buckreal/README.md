# Does a physics-shaped twin of a real buck converter beat plain ARX? Only partly: both land at 0.5 to 0.9 V free-run error against a 0.06 V quantisation floor, and which wins depends on which half of the 20 ms record you fit

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/free-buckreal/

A free-choice project. The twin projects here mostly use the Cascaded Tanks rig (`free-tanktwin`, `free-tankci`, `free-tankfit`); `free-tankfit` listed "a second public rig" as a next step, but the Silverbox and tank hosts are blocked from this sandbox, so this uses a different real measured system that was reachable: a **buck converter** (power electronics, a standard digital-twin target) from the SysIdentPy data repository. It asks the sim-to-real question on hardware data: a model with the converter's structure (static duty-to-voltage curve into a second-order LC lag) against a structure-free ARX. Relates to the digital-twin and system-identification themes of ARPG and CAIRO; no lab code is reused. Produced with AI assistance (Claude).

## Data

`data/buck_id.csv` (1001 samples, 0 to 10 ms) and `data/buck_valid.csv` (999 samples, 10 to 20 ms): 10 µs sampling, input a control voltage of 2.19 to 2.52 V, output the converter voltage, 11 to 16.6 V in steps of 0.2 V (so a quantisation floor of 0.2/√12 = 0.058 V). Copied from [`wilsonrljr/sysidentpy-data`](https://github.com/wilsonrljr/sysidentpy-data) (`datasets/buck`, MIT licence), which is the data behind SysIdentPy's examples. That repository does not say who ran the experiment or what the input scaling is, so neither is asserted here, and the two files are a contiguous split of one record, not independent runs.

## Method

- **Twin** (5 parameters): `y = c0 + G(s)·(c1·du + c2·du²)`, `du = u − 2.35 V`, `G` a unit-gain second-order lag `ωn²/(s²+2ζωn s+ωn²)` discretised exactly (zero-order hold), plus an optional input delay. This is the averaged LC filter behind a duty-to-voltage curve (a Hammerstein structure); the `linear` variant sets `c2 = 0`. Fitted by free-run least squares (4 starting points for `ωn, ζ`); the delay (0 to 20 samples) is chosen on the training half only.
- **ARX** `na/nb` from 1/1 to 10/10 with a constant, fitted by one-step least squares and scored in free run from the first measured outputs (the stricter test).
- Scores: free-run RMSE on the held-out half, then the same with the halves swapped. A block bootstrap (100-sample blocks, 2000 draws) puts an interval on ARX 2/2 minus twin. ARX 2/2 has the same number of parameters (5) as the twin.

## Results (`experiments/results.txt`, figure `experiments/valid_trace.png`)

| fit on / test on | constant | twin linear | twin Hammerstein | ARX 2/2 | ARX 10/10 |
|---|---|---|---|---|---|
| first 10 ms / next 10 ms | 1.32 V | 0.72 | 0.62 | 0.58 | 0.55 |
| next 10 ms / first 10 ms | 1.32 V | 0.67 | **0.50** | 0.82 | 0.71 |

- **No model is close to the data.** The best free-run error is 0.50 V, nine times the 0.058 V quantisation floor; the one-step-ahead ARX error is about 0.13 V. Whatever drives the rest (switching ripple, load or supply variation, dynamics outside a 2nd-order lag) is not in any model here.
- **The twin's static curvature matters:** Hammerstein beats the linear twin by 0.10 V (forward) and 0.17 V (reverse).
- **Hammerstein twin against ARX 2/2 flips with direction.** Forward, ARX is 0.04 V better (bootstrap −0.28 to +0.26 V, no difference). Reversed, the twin is 0.32 V better (+0.22 to +0.49 V excludes zero). Averaged over both directions the twin is ahead (0.56 V against 0.70 V), but this is two numbers from one 20 ms record.
- ARX's error is not monotone in order (reversed: 0.69 V at 1/1, 0.89 V at 6/6, 0.71 V at 10/10), so a model-order choice is itself a source of spread here.

## Limitations

- 20 ms, one record, two halves; the input sequence in each half is different, and the bootstrap blocks are correlated within a short trace. The two halves need not cover the same operating range, so the directions are not symmetric.
- The twin is not derived from component values (L, C, load, switching frequency): they are not given with the data, so `ωn` and `ζ` are fitted, not sourced. The fitted `ωn` of about 5×10³ rad/s (0.8 kHz) is reported in `results.json` and has no datasheet to check it against.
- Local optimisers, 4 starts; delay chosen from 6 values.
- Not a claim about buck converters in general.

## Reproduce

```
python3 -m pytest -q research/free-buckreal/tests        # 5 tests, a few seconds
python3 research/free-buckreal/experiments/run.py        # about 1.5 min, numpy + scipy
python3 research/free-buckreal/experiments/figure.py     # needs matplotlib
```

## Next steps

- Derive the twin from L, C, R and switching frequency once a datasheet or the original experiment description is found, and compare the fitted `ωn` with it.
- Model the output ripple (a state-space twin with the switching harmonic) to see how much of the 0.5 V is ripple.
- Fit on longer records or several operating points; the Silverbox and Wiener-Hammerstein rigs when their hosts are reachable.

## Outside dependencies
numpy, scipy; matplotlib for the figure. Data: SysIdentPy data repository (MIT).
