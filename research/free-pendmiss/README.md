# free-pendmiss: does an inverted-pendulum loop tuned on a fixed-period twin survive missed samples, and does an interval-aware gain fix it?

**Why this was worth doing.** `free-jittertwin` found, for a scalar unstable plant, that a gain tuned on a fixed-period twin is fragile to *missed* samples and listed two next steps: an interval-aware gain and a second-order plant. This does both on a linearised inverted pendulum (x&Prime; = (g/L) x + u, L = 0.5 m, g = 9.80665 m/s&sup2;). **Result (exact discretisation, exact second-moment test, Monte Carlo exponent):** with slow closed-loop poles (0.8 per sample) the fixed gain survives every miss probability as long as the plant is not too unstable per sample (&omega;h<sub>0</sub> &le; 0.8); at &omega;h<sub>0</sub> = 1.4 its mean-square margin falls to q = 0.21. With fast poles it is much worse: a deadbeat-tuned gain is mean-square stable only up to q = 0.03 to 0.10 (a.s. up to 0.80). A gain recomputed from the actual elapsed interval (poles at the same place for h and 2h) was stable for **every** q in all 15 cases tested, in both senses. Simulated, linear, noise-free. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/free-pendmiss/

**Builds on.** `free-jittertwin` (scalar plant, same miss law) and standard random-sampling / Markov-jump linear system ideas (almost-sure exponent vs second-moment stability). No external paper is relied on or re-verified; no CU Boulder group's work is built on or implied. Digital-twin link: a twin that steps at a fixed period hides the controller's real timing.

## Model
Exact zero-order-hold discretisation over an interval h: A<sub>d</sub> = [[cosh &omega;h, sinh(&omega;h)/&omega;], [&omega; sinh &omega;h, cosh &omega;h]], B<sub>d</sub> = [(cosh &omega;h &minus; 1)/&omega;&sup2;, sinh(&omega;h)/&omega;], &omega;&sup2; = g/L. Gain K places both poles at `pole` (Ackermann). *Fixed* gain: K(h<sub>0</sub>) always. *Aware* gain: K(h) for the interval actually elapsed. Interval is h<sub>0</sub>, or 2h<sub>0</sub> with probability q. Mean-square margin: spectral radius of E[G&otimes;G] (&lt; 1 iff stable), by repeated squaring (`ms_rate`; nilpotent deadbeat matrices handled exactly). Almost-sure margin: Lyapunov exponent of 40,000 renormalised steps on a 0.05 q-grid (seed 7).

## Reproduce
```bash
cd research/free-pendmiss
python3 -m unittest discover -s tests -v   # 7 tests
python3 experiments/run.py                 # about 2 minutes, stdlib only
```

## Results
`experiments/results.txt` has all 15 rows (&omega;h<sub>0</sub> in 0.2, 0.5, 0.8, 1.1, 1.4 &times; pole 0.8, 0.4, 0). Fixed-gain mean-square limit q<sub>ms</sub> (a.s. limit in brackets); aware gain: 1.000 (1.00) everywhere.

| &omega;h<sub>0</sub> | pole 0.8 | pole 0.4 | pole 0 (deadbeat) |
|---|---|---|---|
| 0.2 | 1.000 (1.00) | 0.877 (0.95) | 0.098 (0.80) |
| 0.5 | 1.000 (1.00) | 0.860 (0.90) | 0.087 (0.80) |
| 0.8 | 1.000 (1.00) | 0.823 (0.90) | 0.069 (0.80) |
| 1.1 | 0.603 (0.65) | 0.746 (0.85) | 0.051 (0.80) |
| 1.4 | 0.207 (0.35) | 0.583 (0.70) | 0.034 (0.80) |

Checks: the tests verify the discretisation against its series and semigroup property, Ackermann pole placement, and `ms_rate` against a deterministic case, a nilpotent case and a Monte Carlo second moment (within 25%).

## Limitations
- Linear, noise-free, known plant; iid misses with a single miss law (interval doubles); no delay, quantisation or actuator limits.
- The aware gain assumes the controller knows the elapsed time exactly, which a real stack may not; and it needs the gain recomputed (or tabulated) per interval. Switching between individually stable loops is not stable in general; it held here for this one plant and two intervals only.
- One plant length (0.5 m); the sweep over &omega;h<sub>0</sub> varies the period, not the plant. Pole values (0.8, 0.4, 0) and the grid of &omega;h<sub>0</sub> are chosen sweep points, not from a datasheet.
- The a.s. column is a Monte Carlo estimate on a 0.05 grid, so it can be off by one grid step near its limit.

## Next steps
Interval-aware gain with *estimated* (noisy) elapsed time; more than two interval values; a delay on top of misses; a nonlinear pendulum in a physics engine.
