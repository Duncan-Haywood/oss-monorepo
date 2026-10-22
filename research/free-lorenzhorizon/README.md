# free-lorenzhorizon: how long does a digital twin of a chaotic system stay right, and does a parameter error cost less than a state error?

**Why this was worth doing.** Twins of chaotic systems are scored by how long they track the real system. A free-choice question: each factor of 10 of error costs how much horizon, and is a wrong *parameter* the same as a wrong *state*? **Result (simulation, no invented input):** on the Lorenz-63 attractor (&sigma;=10, &rho;=28, &beta;=8/3) the largest Lyapunov exponent measured here is &lambda;=0.904, against the published 0.9056. Mean time for a twin with the exact parameters to drift 1.0 away from truth (40 start points) grows by 1.124 time units per e-fold of smaller initial-state error (1/&lambda; = 1.106): 4.1 at 10<sup>&minus;2</sup>, 16.9 at 10<sup>&minus;7</sup>. A parameter error of &epsilon; in &rho; with an exact initial state buys less per e-fold (0.85), since the error starts at zero and grows first linearly: horizon 0.95 at &epsilon;=10<sup>&minus;2</sup>, 7.8 at 10<sup>&minus;5</sup>. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/free-lorenzhorizon/

**Builds on.** Lorenz (1963) for the system; the exponent 0.9056 is the value reported by Sprott (*Chaos and Time-Series Analysis*, 2003) and Viswanath (2003), used only as a check. No CU Boulder group's work is built on; the link to the digital-twin theme is that a twin's useful lifetime is set by &lambda;.

## Model and parameters
| input | value | source |
|---|---|---|
| &sigma;, &rho;, &beta; | 10, 28, 8/3 | Lorenz (1963) |
| integrator | RK4, h = 0.005 | test checks 4th-order convergence |
| tolerance | 1.0 (Euclidean) | chosen; ~1/20 of attractor width |
| starts | 40 states on the attractor, 1&ndash;5 time units apart after 20 units spin-up | seeded (7) |

`lorenz.py` integrates truth and twin together and returns the first time they are `tol` apart. &lambda; is by Benettin renormalisation (t=400).

## Reproduce
```bash
cd research/free-lorenzhorizon
python3 -m unittest discover -s tests -v     # 4 tests, incl. exponent vs 0.9056 +-0.05
python3 experiments/run.py                   # about a minute, stdlib only
```

## Results (`experiments/results.txt`)
Initial-state error d<sub>0</sub> (exact parameters): mean T = 4.06, 6.42, 9.31, 11.55, 14.42, 16.94 for d<sub>0</sub>=10<sup>&minus;2</sup>&hellip;10<sup>&minus;7</sup>. The prediction ln(tol/d<sub>0</sub>)/&lambda; is 5.09&hellip;17.82: always about 0.9&ndash;1.2 time units too long (the error must first leave the linear regime and aligns with the unstable direction only after a transient), but the slope matches (1.124 vs 1.106).
Parameter error &epsilon; in &rho; (exact start): T = 0.10, 0.95, 2.84, 5.19, 7.81 for &epsilon;=10<sup>&minus;1</sup>&hellip;10<sup>&minus;5</sup>; the fitted slope 0.85 is below 1/&lambda; because the error is ~&epsilon;t at first and only then exponential. I did not fit that correction beyond this qualitative reading.

## Limitations
- One system, one tolerance, one error direction (x) for the state test, &rho; only for the parameter test; means over 40 starts hide a wide spread (not reported).
- Noise-free truth with the same integrator as the twin, so integrator error is not part of the gap.
- The offset of about &minus;1 and the explanation for slope 0.85 are not tested against alternatives.

## Next steps
Report the horizon distribution, other parameters (&sigma;, &beta;), an observation-noise twin with data assimilation.

## Owner steps
None.

## Outside dependencies
Python standard library only.
