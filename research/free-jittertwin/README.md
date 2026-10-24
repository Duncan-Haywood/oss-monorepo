# free-jittertwin: does a sampled-data loop tuned on a fixed-period twin survive random sampling intervals?

**Why this was worth doing.** A digital twin usually steps at a fixed period, but a real controller's samples arrive late or not at all. A free-choice hunch: is *jitter* (a spread of intervals) the danger, or *missed samples* (rare long gaps)? **Result (exact calculation plus simulation, stylised):** for an unstable scalar plant x&prime; = 3x sampled at h<sub>0</sub> = 0.5 with a gain that makes the fixed-period twin contract by 0.5 per sample, uniform jitter of up to &plusmn;100% of the period never destabilises it (a short and a long interval average out; both stability tests stay satisfied). Missed samples do: if a sample is missed (period doubled) with probability q, the loop is **almost-surely stable up to q = 0.556 but mean-square stable only up to q = 0.270**. Between those, the mean-square test a twin audit would naturally use says "unstable" while simulated runs converge (q = 0.4: 0 of 2000 blow up); above 0.556 they blow up (70% at q = 0.6). A deadbeat-tuned loop (twin contraction 0) is much more fragile: mean-square limit q = 0.05. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-jittertwin/

**Builds on.** Standard sampled-data and Markov-jump / random-sampling stability ideas (almost-sure Lyapunov exponent versus mean-square moment); no specific paper is relied on or re-verified here. Related in this repository: `latency-twin` (fixed delay) and `twin-audit`. No CU Boulder group's work is built on or implied; the link to the digital-twin theme is that the twin's fixed period hides timing variation.

## Model
x(t) obeys x&prime; = a x with a = 3. Control u = &minus;k x(t<sub>j</sub>) is held between samples, so x(t<sub>j+1</sub>) = g(h<sub>j</sub>) x(t<sub>j</sub>), g(h) = e<sup>ah</sup> &minus; (k/a)(e<sup>ah</sup> &minus; 1). The gain k is set so g(h<sub>0</sub>) = &rho;<sub>0</sub> (the twin's contraction). With iid intervals, the loop is almost-surely stable iff E ln|g| &lt; 0 and mean-square stable iff E g&sup2; &lt; 1; by Jensen the second implies the first, never the reverse. `jitter.py` computes both: by midpoint quadrature (uniform jitter) or exactly (two-point missed-sample law), and finds thresholds by bisection.

## Reproduce
```bash
cd research/free-jittertwin
python3 -m unittest discover -s tests -v     # 6 tests
python3 experiments/run.py                   # under a minute, stdlib only, seed 7
```

## Results
Full tables: `experiments/results.txt`.

| twin contraction &rho;<sub>0</sub> | largest uniform jitter j, a.s. | j, mean-square | largest miss prob q, a.s. | q, mean-square |
|---|---|---|---|---|
| 0.0 (deadbeat) | &ge; 0.999 (cap) | 0.736 | 1.000 | 0.050 |
| 0.3 | &ge; 0.999 | 0.976 | 0.536 | 0.114 |
| 0.5 | &ge; 0.999 | &ge; 0.999 | 0.556 | 0.270 |
| 0.7 | &ge; 0.999 | &ge; 0.999 | 1.000 (no limit) | 1.000 |
| 0.9 | &ge; 0.999 | &ge; 0.999 | 1.000 | 1.000 |

Simulation check at &rho;<sub>0</sub> = 0.5 (2000 runs &times; 300 samples; "blow-up" is |x| growing past 10<sup>6</sup> times |x<sub>0</sub>|): the median log-growth per sample matches E ln|g| to 3 decimals where runs do not blow up (q = 0.1 to 0.5), and the blow-up fraction is 0 at q &le; 0.4, 0.004 at 0.5, 0.701 at 0.6 and 1.0 at 0.8 (at those the median rate in the table is truncated by the stopping rule). Where the mean-square test fails but the exponent is negative (q = 0.4, 0.5) almost every run converges: a mean-square verdict from a twin is conservative, not wrong in sign.

## Limitations
- **Scalar, noise-free, known plant**; jitter or misses are iid and the controller knows nothing about them. Correlated bursts of misses, delay in addition to jitter, and measurement noise are not modelled.
- **One plant** (a = 3, h<sub>0</sub> = 0.5). Uniform jitter reaching j = 1 never failed here, but for larger a h<sub>0</sub> or when the interval can grow far past h<sub>0</sub> this will not hold; the miss law (doubling) is the harsher case studied.
- Jitter thresholds are capped at j = 0.999 (intervals stay positive).
- The simulation check uses the same model, so it validates the arithmetic, not the physics.
- "Mean-square vs almost-sure" is textbook; the contribution is the worked numbers for the twin-tuning setting.

## Next steps
Add a delay on top of the jitter; try an interval-aware gain (k computed from the actual elapsed time), which should remove the miss penalty; use a second-order plant.

## Owner steps
None.

## Outside dependencies
Python standard library only.
