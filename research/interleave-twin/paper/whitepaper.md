# A link twin with independent loss says repeats go back to back: what burstiness does to repetition coding for shared maps, and what spacing buys

## Question
Multi-robot mapping simulators often drop packets independently at the measured loss rate. Real radio links lose packets in bursts. If a map update is protected by repeating it, how wrong is the twin's certified design, and what does the real link require instead?

## Model
An update is sent as `r` copies at slots `0, g, …, (r−1)g` (latency `(r−1)g`); it is lost iff every copy is. Twin: independent slot loss with probability `p`; residual `p^r`, so the cheapest design is `g = 1`. Real: a stationary two-state chain with marginal loss `p` and lag-1 correlation `λ ∈ [0,1)`: `P(lost | previous lost) = q = p + λ(1−p)`, and at lag `g` `q_g = p + λ^g(1−p)` (the chain's second eigenvalue is `λ`). The copies, sampled every `g` slots, form a chain with correlation `λ^g`, so

`P(all r lost) = p · q_g^(r−1)`.

Consequences: for `r = 2` the real/twin ratio is exactly `1 + λ^g(1−p)/p`; spacing for a ratio `1+δ` needs `g ≥ ln(δp/(1−p))/ln λ`; the residual never goes below `p^r`, so a copy budget `r` sets a floor `p^r` no spacing can cross, and the smallest `r` with `p^r ≤ ε` is also the smallest feasible budget.

## Results
All numbers from `research/interleave-twin/experiments/results.txt`; `p = 0.2`, target residual `ε = 10⁻³`.
1. **Twin design.** The twin certifies `r = 5` back-to-back copies (latency 4, residual 3.2×10⁻⁴). Real residual of that design: 0.0075, 0.026, 0.067, 0.100, 0.143 for `λ` = 0.3, 0.5, 0.7, 0.8, 0.9 (23×, 81×, 208×, 311×, 448× the twin's claim). Back-to-back copies needed instead: 8, 12, 21, 32, 65.
2. **Spacing.** Two copies at `λ = 0.8`: ratio 4.20 at `g = 1`, 2.31 at `g = 5`, 1.28 at `g = 12`, 1.05 at `g = 20`. Within 10% of the twin needs `g` = 6, 17, 36 at `λ` = 0.5, 0.8, 0.9.
3. **Copy-budgeted minimum latency** for `ε = 10⁻³`: with `r ≤ 4` infeasible at all `λ` tested (floor `p⁴ = 1.6×10⁻³`); with `r ≤ 8`, 12 slots (`r = 7, g = 2`) at `λ = 0.5`, 35 (`8, 5`) at 0.8, 77 (`8, 11`) at 0.9, 154 (`8, 22`) at 0.95, against the twin's 4.
4. **A counter-case.** At a fixed deadline `D` with unlimited copies, back-to-back beats few spaced copies at long deadlines (`λ = 0.8, D = 48`: `r = D+1` consecutive 4.6×10⁻⁵; `r = 4` spaced 2.2×10⁻³), because many correlated copies still add up. Interleaving is the right tool when the copy budget, not the deadline, binds. At `D = 3` spacing does not help (0.119 for `r = 4`, the same as consecutive).
5. **Numerics.** The closed form matches enumeration to 12 digits in the tests, and Monte Carlo (200,000 chains) within 0.4–2.1 standard errors (four configurations, seed 7: 0.168000 vs 0.169430, 0.141120 vs 0.142720, 0.055689 vs 0.055500, 0.095789 vs 0.095390).

## Limitations
Stylised, no radio data. Loss is all-or-nothing in the bad state and zero in the good state; one stationary chain with known parameters (estimating `λ` from a short log, and non-stationary fades, would make the design worse); no acknowledgements or retransmission, which change the problem (feedback replaces blind repetition); copies do not load the link, which in a shared channel they would; updates are independent. The twin is a deliberately naive baseline.

## Next steps
Estimate `(p, λ)` from a finite trace and quantify the design regret, in the `twin-certification` style; replace blind repeats by ARQ and compare under latency budgets; erasure-coded (k-of-n) spreading rather than repeats; correlated loss across links in a team (shared fading), where spacing in time does not help but routing diversity might; pair with `dropout-twin` and `jitter-twin`.

## References
- Gilbert, E. N. (1960). Capacity of a burst-noise channel. *Bell System Technical Journal* 39(5), 1253–1265.
- Elliott, E. O. (1963). Estimates of error rates for codes on burst-noise channels. *Bell System Technical Journal* 42(5), 1977–1997.
- Lin, S. and Costello, D. J. (2004). *Error Control Coding*, 2nd ed. Pearson.
