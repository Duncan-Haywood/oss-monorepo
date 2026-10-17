# A twin with exponential service over-admits load onto a shared instrument by up to 5× when real service times are heavy-tailed

*Stylised: one FIFO server, Poisson arrivals, i.i.d. service with mean 1; the twin is exponential (`c²=1`), the "real" instrument lognormal with squared CV `c²` or Pareto. Pure Python; every number is from `experiments/results.txt` (seeded, ~60 s). The "real" instrument is itself simulated; no lab data.*

## Question
Digital twins of lab workcells are used to decide how many robots may share one instrument. A twin fitted to the mean service time, with service otherwise modelled as exponential, answers "what load keeps the mean wait under an SLA?". How wrong is that answer when real service times have the same mean but a heavier tail, and can it be repaired from a log of real service times?

## Model
Jobs arrive at Poisson rate `ρ` (time unit = mean service time), one server, FIFO. With service squared CV `c²` the Pollaczek–Khinchine formula gives the mean queueing delay `ρ(1+c²)/(2(1−ρ))`; it is infinite when the service variance is. So at the same load the real/twin mean wait is exactly `(1+c²)/2`, and the load admissible at `w` service times is `ρ*(c²)=2w/(1+c²+2w)`. The exponential twin also has the tail `P(W>t)=ρe^{−(1−ρ)t}`.

## Results (SLA: mean wait ≤ 2 service times)
1. **P–K is right.** Against 1.5·10⁶-job Lindley simulations (20 contiguous batches) the formula is within one standard error in all four cases, e.g. `c²=4, ρ=0.7`: 5.833 vs 5.953 ± 0.171.
2. **Over-admission.** The twin admits `ρ=0.667`. Real `ρ*` is 0.800/0.727/0.571/0.444/0.286/0.133 for `c²`=0/0.5/2/4/9/25, so the twin overloads by 0.83×/0.92×/1.17×/1.5×/2.3×/5.0×; at the twin's load the real mean wait is 1.0/1.5/3.0/5.0/10/26 (0.5×…13× the SLA). A less-variable real service (`c²<1`) makes the twin conservative.
3. **Tails.** The twin claims a 99th-percentile wait of 12.6 service times at `ρ=0.667`. With lognormal service the real fraction of jobs waiting longer is 0.117 (`c²=4`) and 0.205 (`c²=9`), i.e. 11.7× and 20.5× the claim; the real P99 is 48.2 and 113.5 (3.8× and 9.0×). The simulated mean (5.07, 10.14) matches P–K (5.00, 10.00).
3b. **Infinite variance.** Pareto service with mean 1 and `ρ=0.5` (twin claim 1.0): index 3.0 and 2.5 settle at 0.66 and 0.85 (P–K 0.67 and 0.90); index 1.8 and 1.5 have infinite P–K mean and the simulated mean wait keeps growing with run length (median of 5 seeds: 1.58/3.25/6.23 and 6.67/8.83/33.4 at 10⁴/10⁵/10⁶ jobs). A twin run longer to "converge" would not.
4. **Repair from logs fails (negative).** Plugging the sample `c²` of `n` logged lognormal(`c²=4`) service times into `ρ*` gives a real-SLA violation in 89%/81%/78%/70% of 400 repeats at `n`=25/100/400/1600 (median `ĉ²`=1.7/2.5/3.0/3.4; mean real wait/SLA 1.81/1.40/1.21/1.09). The sample variance of a skewed law is biased low in the median, so a plug-in capacity is optimistic. A 90% bootstrap upper bound on `c²` violates in 81%/67%/56%/46%, so it needs far more than `n=1600` to reach a nominal 10%; the bootstrap cannot see tail mass the log did not contain. At `n=400` it costs nothing on average (`ρ*−ρ` used = 0.002) but is still violated more than half the time.

## Limitations
Poisson arrivals and independent service (real jobs are batched, correlated and have set-up times; correlated arrivals would need Kingman-type approximations, not derived here); a single server; lognormal and Pareto are chosen shapes, not fitted; the repair uses one estimator of `c²` and one bootstrap rule, with no claim that a better estimator or a parametric tail fit cannot do better; the P–K mean wait is a long-run steady-state average and says nothing about transient start-up waits.

## Next steps
Tail-index estimation (Hill-type) in place of a plug-in variance; multi-server (M/G/c) instruments; correlated arrivals from a robot team's scheduling; an anytime-valid audit of the service law in operation (`twin-audit`); comparison with the deterministic-duration twin in `workcell-twin`.

## References
- Pollaczek, F. (1930). Über eine Aufgabe der Wahrscheinlichkeitstheorie. *Mathematische Zeitschrift* 32, 64–100.
- Khinchine, A. Y. (1932). Mathematical theory of a stationary queue. *Matematicheskii Sbornik* 39(4), 73–84.
- Lindley, D. V. (1952). The theory of queues with a single server. *Mathematical Proceedings of the Cambridge Philosophical Society* 48(2), 277–289.
- Asmussen, S. (2003). *Applied Probability and Queues*, 2nd ed. Springer.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
