# A memoryless heartbeat twin and the watchdog timeout it certifies

## Question
Robots stop when `m` consecutive heartbeats from a supervisor are missed. A simulator drops each heartbeat independently at the measured mean loss rate. How wrong is its false-trip rate when the real link loses packets in bursts, and what does a timeout chosen in the twin cost in the real world?

## Model
Real link: hidden state G/B, loss iff B, `P(G→B) = a`, `P(B→G) = b = 1/L`, mean loss `p = a/(a+b)` so `a = pb/(1−p)` (feasible while `a ≤ 1`); stationary start. Twin: i.i.d. loss with the same `p`. The two coincide exactly when `a + b = 1` (`L = 1/(1−p)`). The watchdog trips at the first run of `m` losses; `T` is the tick of the first trip.

Exact twin: `E[T] = (1 − p^m)/((1 − p)p^m)`. Exact real: with `F_G` and `F_k` the expected further ticks after a good tick and after `k` consecutive losses (`F_m = 0`), `F_G = 1 + (1−a)F_G + aF_1`, `F_k = 1 + bF_G + (1−b)F_{k+1}`; writing `F_k = α_k + β_kF_G` by back-substitution from `k = m−1` leaves one scalar equation, solved in exact rational arithmetic (the values reach 1e13 and float elimination loses digits), and `E[T] = 1 + (1−p)F_G + pF_1`. Large-`m` rate: a burst starts after a good tick at rate `pb` and survives `m−1` more ticks with probability `(1−b)^{m−1}`, so `1/E[T] ≈ (p/L)(1−1/L)^{m−1}` (twin: `(1−p)p^m`). Fixing the target mean time `τ` gives `m_real ≈ 1 + ln(τ p/L)/ln(L/(L−1))` against `m_twin ≈ ln(τ(1−p))/ln(1/p)`.

## Results
(all from `experiments/results.txt`; `p = 0.05`, 1 tick = 1/50 s)
1. **Mean time to false trip.** At `m = 5` the twin gives 3.368e6 ticks; the real link 637.1, 235.4, 286.3, 453.1, 987.7 for `L = 2, 5, 10, 20, 50` (twin/real 5.3e3, 1.4e4, 1.2e4, 7.4e3, 3.4e3). At `m = 12` the twin gives 4.3e15 and the real link 8.2e4 to 1.2e3. At the i.i.d. burst length 1.0526 the two agree exactly (tests).
2. **Non-monotone in burst length.** At fixed `p` a longer burst is rarer (onsets `∝ p/L`) but survives the timeout more often (`(1−1/L)^{m−1}`). The worst `L` is near `m`: 3.10, 5.15, 8.30, 12.45, 20.75 for `m = 3, 5, 8, 12, 20`, with mean time to trip 130, 235, 393, 602, 1021 ticks against `e·m/p` = 163, 272, 435, 652, 1087. The twin says 8.4e3 to 1.1e26 for the same `m`.
3. **Approximation.** Exact/approximate rate ratios 1.0119 (`m = 10, L = 5`), 1.0013 (20, 5), 1.0127 (20, 10), 1.0015 (40, 10); twin `(1−p)p^m` exact to 6e-6 at `m = 4` and 1e-7 or better beyond.
4. **Choosing the timeout.** For a mean time to false trip of 1e6 ticks (5.6 h) the twin picks `m = 5` (0.10 s to detect a dead link). The real link needs `m = 16, 43, 82, 154` for `L = 2, 5, 10, 20` (continuous formula 15.6, 42.3, 81.8, 153.5), i.e. 0.32, 0.86, 1.64, 3.08 s. Deploying `m = 5` gives a mean time to trip of 12.7, 4.7, 5.7, 9.1 s.
5. **Burst length unknown.** The smallest `m` with worst-case-over-`L` mean time to trip at least 1e3 and 1e4 ticks is 20 (0.4 s) and 192 (3.8 s); 1e6 would need `m ≥ 18394` (368 s) by `e·m/p`. A timeout cannot be sized from the mean loss rate alone; it needs a burst-length estimate from real logs.
6. **Monte Carlo (20000 runs, seed 7).** Real `(L, m) = (5, 5), (10, 4), (2, 6)`: 232.3, 252.7, 1293.7 against exact 235.4, 255.8, 1277.1 (ratios 0.987, 0.988, 1.013); twin `m = 3`: 8443 against 8420.

## Limitations
Stylised, no link traces. Loss is 0 or 1 by state (a Gilbert, not Gilbert–Elliott, channel), sojourns are geometric, the start is stationary, and `p = 0.05` is a single operating point; the watchdog is a bare consecutive-miss counter, and real links also have delay, jitter and correlated outages across robots. Item 5 uses a grid over `L ∈ [m/2, 2m]` and the `e·m/p` approximation for the 1e6 target, not an exhaustive search. The twin is a deliberately naive baseline: one fitted to the burst length reproduces the real values by construction.

## Next steps
Fit `(p, L)` from real telemetry and bootstrap the timeout; windowed (k-of-n) and adaptive watchdogs against the same twin; Gilbert–Elliott channels with partial loss in the good state; couple to `jitter-twin` for combined loss and delay; several robots sharing one outage process.

## References
- Gilbert, E. N. (1960). Capacity of a burst-noise channel. *Bell System Technical Journal* 39(5), 1253–1265.
- Elliott, E. O. (1963). Estimates of error rates for codes on burst-noise channels. *Bell System Technical Journal* 42(5), 1977–1997.
- Feller, W. (1968). *An Introduction to Probability Theory and Its Applications*, Vol. 1, 3rd ed. Wiley (runs and recurrent events).
