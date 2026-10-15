# What Does It Cost to Buy Decentralised Compute? Exact Reverse-Auction Payments and Reserves

*Stylised model; MIT licensed. Code: `src/compute_procurement`, results: `experiments/results.txt`.*

## Abstract
A permissionless compute network must buy k identical units of work from n devices whose costs are private. We study the k-unit reverse auction with independent costs U[0,1] and buyer value v per unit. We give exact closed forms: the truthful threshold mechanism pays `k(k+1)/(n+1)` in expectation for winners whose true cost totals `k(k+1)/(2(n+1))`, a frugality ratio of exactly 2 for all n and k; with a reserve r the exact payment is a binomial expression and the ratio stays 2. The buyer-optimal reserve is v/2 (Myerson's virtual cost 2c), verified by grid search, and it is worth nothing once v ≥ 2. A pay-as-bid (first-price) auction has a symmetric equilibrium `b(c) = c + ∫_c^r W(x)dx / W(c)` whose revenue matches the truthful auction by revenue equivalence, confirmed by simulation, with no profitable deviation on a grid. Everything is checked against Monte Carlo.

## 1. Model
n devices draw costs c_i ~ U[0,1] i.i.d. Mechanism M(k,r) accepts the up-to-k lowest bids ≤ r and pays each winner min(r, c_(k+1)), the (k+1)-th lowest bid. This is a threshold payment, so truthful bidding is dominant. The buyer's utility is `v·E[#winners] − E[payment]`.

## 2. Exact payment and frugality
With no reserve, c_(k+1) ~ Beta(k+1, n−k) has mean (k+1)/(n+1), so E[payment] = k(k+1)/(n+1), while the k lowest costs sum in expectation to Σ i/(n+1) = k(k+1)/(2(n+1)). The ratio is **2**, independent of n and k. With reserve r, N = #{c_i ≤ r} ~ Bin(n,r) and payment is N·r if N ≤ k, else k·c_(k+1); using `x·f_{k+1,n−k}(x) = (k+1)/(n+1)·f_{k+2,n−k}(x)`,
`E[pay] = r Σ_{j≤k} j·P(N=j) + k(k+1)/(n+1)·P(Bin(n+1,r) ≥ k+2)`,
and the winners' expected cost is `Σ_i i/(n+1)·P(Bin(n+1,r) ≥ i+1)`. The 2× ratio persists. It is the information rent of uniform costs: virtual cost φ(c) = c + F/f = 2c, so the buyer pays double the cost it would pay with public costs. Monte Carlo (n=10, k=3, r=0.4, 4·10⁵ trials): payment 0.8806 exact vs 0.8808, cost 0.4403 vs 0.4404.

## 3. Optimal reserve
A buyer who values units at v should buy while virtual cost 2c ≤ v, i.e. reserve r* = v/2. Grid search over r for n=20, k=8 gives r* = 0.200, 0.400, 0.600, 0.800 for v = 0.4, 0.8, 1.2, 1.6 (exactly v/2). Gains over no reserve: +1.028 (v=0.4, where no reserve loses money, utility −0.229), +0.120 (v=0.8), +0.002 (v=1.2), zero for v ≥ 1.6, because with 20 devices the (k+1)-th price already sits below v/2. At v ≥ 2 the cutoff exceeds the support and the reserve never binds. Practical reading: a reserve matters when the buyer's value per unit is comparable to the cost scale, i.e. in thin markets; in thick markets competition does the work of a reserve.

## 4. First-price equilibrium
Let W(x) = P(Bin(n−1,x) ≤ k−1) be the probability that a device with cost x is selected. The symmetric increasing equilibrium bid is `b(c) = c + ∫_c^r W(x)dx / W(c)`. At n=8, k=3: b(0)=0.375, b(0.2)=0.415, b(0.4)=0.531, b(0.6)=0.677, b(0.8)=0.835. Simulated pay-as-bid revenue is 1.3334 vs 1.3333 for the truthful auction (revenue equivalence), and a deviator with cost 0.3 gains at most 5.4·10⁻⁴ over its equilibrium profit on a bid grid (Monte-Carlo noise). Pay-as-bid therefore buys no cheaper compute; its value is that bids are not required to be truthful reports to be safe from threshold manipulation by the operator.

## Limitations and relevance
Costs are i.i.d. uniform and units identical. Real devices differ in speed, memory and reliability, jobs need co-scheduled complementary units (pipeline stages), and devices can split identities (see `sybil-stake`). The uniform 2× frugality is distribution-specific; other regular distributions give ratio `1+E[F/f]/E[c]` and are an easy extension. The result is a baseline price for compute in a Gensyn-style marketplace and shows why verification cost (see `verification-game`, `dispute-arity`) should be added to reserves: the buyer's v is net of verification.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (9 tests) and `PYTHONPATH=src python3 experiments/run.py`.
