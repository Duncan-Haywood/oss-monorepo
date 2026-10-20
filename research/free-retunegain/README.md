# free-retunegain: does retuning the gain on the interval law, instead of the fixed-period twin, remove the missed-sample penalty?

**Why this was worth doing.** `free-jittertwin` showed that a loop tuned on a fixed-period digital twin loses mean-square stability once samples are missed too often (q = 0.270 at twin contraction 0.5, 0.05 for a deadbeat tuning), and left "tune on the interval law" as a next step. A free-choice follow-up: how much of the loss does retuning recover, what does it cost at the nominal period, and how sensitive is it to a wrong estimate of the miss rate? **Result (exact calculation plus simulation, stylised):** for the same unstable scalar plant x&prime; = 3x at h<sub>0</sub> = 0.5, the gain that minimises E g&sup2; over a two-point miss law (h<sub>0</sub> w.p. 1&minus;q, 2h<sub>0</sub> w.p. q) is closed form, and it is mean-square stable for **every** q: the worst retuned E g&sup2; over q is 0.478, against a twin-gain E g&sup2; that passes 1 at q = 0.270. The price is a slower nominal loop (the retuned gain contracts by 0.63&ndash;0.82 per on-time sample instead of 0.5 or 0). A gain designed for a modest q = 0.3 stays mean-square stable at every true q from 0 to 1 (E g&sup2; &le; 0.58), so the miss rate need not be known well. Under uniform jitter of &plusmn;99.9% the retuned E g&sup2; is 0.48 versus 2.48 for a deadbeat twin gain. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-retunegain/

**Builds on.** `research/free-jittertwin` (same plant, same model, same notation; it computed the failure regions this project tries to remove) and standard random-sampling / Markov-jump stability ideas (mean-square versus almost-sure); no specific paper is relied on or re-verified. Related here: `latency-twin`, `twin-audit`. No CU Boulder group's work is built on or implied; the link to the digital-twin theme is that a twin's fixed period hides timing variation and the gain tuned on it inherits that blind spot.

## Model
x(t<sub>j+1</sub>) = g(h<sub>j</sub>) x(t<sub>j</sub>), g(h) = e<sup>ah</sup> &minus; &kappa;(e<sup>ah</sup> &minus; 1), &kappa; = k/a, h<sub>j</sub> iid. The twin gain sets g(h<sub>0</sub>) = &rho;<sub>0</sub>. Retuning picks &kappa; to minimise E g&sup2; over the interval law; for a discrete law E g&sup2; is a convex quadratic in &kappa;, so &kappa;* = &Sigma; w E(E&minus;1) / &Sigma; w (E&minus;1)&sup2; with E = e<sup>ah</sup> (`retune.py`). An almost-sure variant minimises E ln|g| by grid scan plus refinement. A gain that knew each interval in advance would give g = &rho;<sub>0</sub> every time and is trivial; the point here is a gain that knows only the *law*.

## Reproduce
```bash
cd research/free-retunegain
python3 -m unittest discover -s tests -v     # 6 tests
python3 experiments/run.py                   # seconds, stdlib only, seed 7
```

## Results
Full tables: `experiments/results.txt`.

| true q | E g&sup2; twin gain (&rho;<sub>0</sub>=0.5) | E g&sup2; ms-retuned | retuned g(h<sub>0</sub>) | retuned g(2h<sub>0</sub>) |
|---|---|---|---|---|
| 0.0 | 0.250 | 0.000 | 0.000 | &minus;4.48 |
| 0.1 | 0.528 | 0.463 | +0.629 | &minus;1.03 |
| 0.3 | 1.084 | 0.434 | +0.759 | &minus;0.32 |
| 0.5 | 1.640 | 0.323 | +0.791 | &minus;0.14 |
| 0.6 | 1.918 | 0.262 | +0.800 | &minus;0.10 |

- **No miss-rate limit remains.** The largest q with a mean-square-stable retuned loop is 1.0 (the whole range); the worst retuned E g&sup2; over q is 0.478 (1001-point scan).
- **Robust to a wrong q.** Gains designed for q = 0.3, 0.5 or 0.9 are mean-square stable at every true q in {0, 0.1, &hellip;, 1} (E g&sup2; from 0.00 to 0.66). A gain designed for q = 0.1 reaches E g&sup2; = 1.000 at true q = 0.9 and fails at q = 1 (1.07, every sample missed).
- **Cost at the nominal period.** At q = 0 the best gain is the deadbeat one; at higher design q the gain shifts toward the doubled interval and the on-time contraction slows to 0.63&ndash;0.82 per sample.
- **Simulation check (2000 runs &times; 300 samples, blow-up = |x| &gt; 10<sup>6</sup>|x<sub>0</sub>|).** Twin gain: 0 blow-ups at q = 0.4, 0.718 at 0.6, 1.0 at 0.8. Mean-square-retuned: 0 at all three, median log-rate &minus;0.77, &minus;1.49, &minus;2.68 per sample.
- **Do not minimise E ln|g| naively.** The almost-sure optimum is the deadbeat gain (g = 0 on every on-time sample), which gives E ln|g| of &minus;18 to &minus;31 but E g&sup2; = 8.0 at q = 0.4 because the doubled-interval factor is &minus;4.48; from q = 0.5 the minimiser switches to a gain that zeroes the doubled interval instead. The mean-square optimum is the sensible target.
- **Uniform jitter** (&plusmn;99.9%): E g&sup2; = 0.480 retuned versus 2.478 (deadbeat twin), 1.078 (&rho;<sub>0</sub>=0.3) and 0.600 (&rho;<sub>0</sub>=0.5).

## Limitations
- **Scalar, noise-free, known plant**, iid intervals, a single plant (a = 3, h<sub>0</sub> = 0.5). "Retuned is stable for all q" is specific to this two-point law and plant; it need not hold for larger a h<sub>0</sub>, longer gaps (3h<sub>0</sub>, 4h<sub>0</sub>) or correlated bursts of misses, which are not modelled.
- Mean-square stability is a second-moment guarantee; it says nothing about transients (the doubled-interval factor can be large) or about performance, only stability.
- The gain is not interval-aware at run time; a controller that measured the elapsed time could do better (g = &rho;<sub>0</sub> exactly) but needs a time-stamped sample, which the twin does not have to model.
- The simulation check uses the same model, so it validates the arithmetic, not the physics.
- The retuned-gain result is a textbook consequence of a convex quadratic; the contribution is the worked numbers for the twin-tuning setting.

## Next steps
Longer gaps (an interval law with 1, 2, 3 and 4 h<sub>0</sub>) and Markov-correlated misses; a second-order plant; the price of robustness in a quadratic cost rather than stability alone.

## Outside dependencies
None: Python standard library only.
