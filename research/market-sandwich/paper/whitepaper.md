# Sandwiching a verification market: what a slippage limit gives away

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Verification and routing markets built on a logarithmic market scoring rule (LMSR) execute trades in an order chosen by a sequencer, so a searcher can buy before a victim and sell after. We solve the binary case exactly. (i) The sandwich's profit equals the victim's extra cost, `C(q+x+v) − C(q+x) − C(q+v) + C(q)`, and against a victim who caps its payment at `(1+ε)` times the cost it observed the optimal front-run has a closed form and yields **exactly `ε` times the victim's fair cost** (max error 1.4e-14 over 216 instances). (ii) The front-run needs only `x* ≈ εb/(1−p)` shares, the same drift the victim's limit tolerates, so capital scales with liquidity `b` while profit does not: return on capital falls from 45% to 0.5% as `b` goes 5→500. (iii) A proportional fee `φ* ≈ v(1−p)/(2b)` on both legs kills the attack for any tolerance (ratio to exact 0.975–1.000 for `v/b ≤ 0.1`). (iv) The victim's optimal tolerance is `ε* = s√(2 ln(G/(C₀ s √(2π))))`, `s = σ(1−p)/b`, matching numerics within 2% when `σ, v ≪ b`. (v) Pro-rata batching does not remove the attack (with an average-price limit it retains 0.989–0.999 of the extraction, using twice the capital), while uniformly random ordering cuts it by exactly 3×. Exact computation and deterministic numerics; stylised model.

## 1. Model
Binary LMSR with liquidity `b`: cost `C(q) = b ln(1+e^{q/b})`, price `p = σ(q/b)`, where `q` is YES minus NO shares. Buying `v` YES shares at state `q` costs `c₀ = C(q+v) − C(q)`. A victim submits `v` with maximum payment `L = (1+ε)c₀`, computed at the state it saw. The searcher buys `x`, lets the victim execute, and sells `x`.

## 2. Exact extraction
Searcher profit is `(C(q+x+v) − C(q+v)) − (C(q+x) − C(q))`, which is the mixed second difference `M(x)` and is also the victim's extra payment `[C(q+x+v) − C(q+x)] − c₀`: the attack is zero-sum between searcher and victim (tested for arbitrary `x`). `M` is increasing in `x`, so the best attack pushes the victim to its limit. Writing `u = e^{(q+x)/b}`, `K = e^{L/b}`, `E = e^{v/b}`, the victim's cost equals `L` at
`x* = b ln((K−1)/(E−K)) − q`, finite iff `L < v` (a limit above the payoff lets the attacker drive the price to 1). Then `M(x*) = L − c₀ = ε c₀`, exactly. The tolerance is paid out in full; the market's curvature and `b` do not matter (E1).

## 3. Capital and fees
For small `ε` and `v/b`, `x* ≈ εb/(1−p)` (E2: 4.05 vs 4.00 at `b=100`). Capital is `≈ x*p`, so the return on capital is `≈ v(1−p)/b`, shrinking as `1/b` while the profit stays `≈ 0.05` at `ε=0.02, v=5` (0.0620 at `b=5` to 0.0501 at `b=500`). A searcher with little capital is limited to `min(x*, budget)`. With proportional fee `φ` on buy cost and sell proceeds, net profit is `εc₀ − φ(B+R)` with `B ≈ x*p`, `R ≈ x*(p + vp(1−p)/b)`, so break-even is
`φ* ≈ v(1−p)/(2b)`, independent of `ε`. E3 (`b=100`): `v/b = 0.1, 0.05, 0.01, 0.001` give exact/first-order ratios `0.975, 0.987, 0.997, 1.000` (at `ε=10⁻⁴`; 0.92–0.96 at `ε=0.1`). A 1% fee protects trades up to about 4% of `b` at `p=½`; bigger trades are not protected by fees any reasonable market charges.

## 4. Choosing the tolerance
Other flow moves the state by `d ~ N(0,σ²)` shares between observation and inclusion; the trade then fails if the cost exceeds `L`, to first order iff `d > εb/(1−p)`, and failure forfeits an opportunity worth `G`. With the searcher always present the victim minimises `εc₀ + G·P(fail)`, giving
`ε* = s√(2 ln(G/(c₀ s√(2π))))`, `s = σ(1−p)/b`, and `ε* = 0` if the log argument is ≤ 1. Tolerance grows only as the square root of a log of the stakes: a 10× larger `G` raises `ε*` by a third in E4 (0.117→0.156). E4 gives closed-form vs numeric `0.1591/0.1560, 0.1174/0.1170, 0.0849/0.0840, 0.0449/0.0450`; the approximation is poor when noise and trade are large relative to `b` (`b=10`: 0.417 vs 0.343). Choosing `ε*` cuts expected loss from 24.9 to 0.43 (`G=50`) versus a zero-tolerance order that fails often.

## 5. Batching and ordering
*Pro-rata batching.* If a batch nets orders and charges each trader the average price `(C(Q)−C(q))/(x+v)`, the searcher buys `x` alongside the victim and unwinds alone in the next batch. Without a limit the profit tends to `v − c₀` (2.1907 at `b=10, v=5`, the victim's entire surplus at price 1); with an average-price limit `(1+ε)c₀` it obtains 0.989, 0.993, 0.999 of `εc₀` for `ε = 0.01, 0.05, 0.2`, at twice the capital of the sequential attack. Netting alone is not a defence, because the searcher's second leg is priced at the marginal path.
*Random order.* If buy, victim and sell are ordered uniformly at random (a void sell leaves inventory that is liquidated at the market path), expected profit is exactly one third of the sandwich profit for every `x` (E6): two of six orderings deliver `M(x)`. Randomisation lowers, not removes, the attack; a searcher can submit more legs.

## 6. Limitations
(1) Binary LMSR, one victim, one searcher; multiple searchers turn `εc₀` into a bid to the sequencer (priority-fee competition), which changes who gains, not the victim's loss. (2) Victim's limit is a fixed multiple of the observed cost; limits that depend on private beliefs are not analysed, though `ε = 0` protects whatever the belief. (3) Fees are proportional and paid on both searcher legs; fixed gas costs would add a size threshold and are omitted. (4) The drift model is Gaussian and first-order; E4 shows where it fails. (5) Not an analysis of any deployed sequencer or protocol. Contributions: exact `ε c₀` extraction identity and closed-form front-run; fee threshold `≈ v(1−p)/(2b)`; optimal tolerance; failure of pro-rata batching; 1/3 factor for random ordering.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (13 tests) and `PYTHONPATH=src python3 experiments/run.py` (deterministic; seconds).
