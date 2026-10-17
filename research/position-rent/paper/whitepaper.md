# Position rent: what a sequential LMSR verification market pays each seat

## Setting
A binary claim `y` (training run correct or not, uniform prior) is priced by an LMSR with liquidity `b`. Verifier `k` holds a signal `s_k` equal to `y` with probability `a_k`, conditionally independent given `y`, trades once in arrival order, and moves the price to its Bayesian posterior. This is the myopic-truthful benchmark (for conditionally independent signals, Chen et al. and Dimitrov–Sami show strategic delay does not pay; we do not address complements, see `verifier-complements`).

## Result 1: rent is conditional mutual information
Trader `k`'s realised profit is `b[ln p_k(y) − ln p_{k−1}(y)]`. Taking expectations, `E ln p_k(y) = −H(y | s_≤k)`, so
`rent_k = b (H(y|s_<k) − H(y|s_≤k)) = b·I(y; s_k | s_<k)`.
Summing, `Σ rent_k = b·I(y; s_1..n) ≤ b ln 2`. The right side is the market maker's worst-case loss for *any* trade sequence; the left is its *expected* loss under this population. Verified by simulating the explicit cost function `C(q) = b ln Σ e^{q_i/b}` with 200,000 trials (a=0.7, n=5): simulated rents (0.0822, 0.0698, 0.0595, 0.0524, 0.0455) vs exact (0.0823, 0.0694, 0.0599, 0.0522, 0.0457), maker loss 0.3094 vs 0.3095.

## Result 2: rents fall with position, at the Chernoff rate
For iid signals `rent_k` is computed exactly from the binomial count of agreeing signals (`H_k = E[−ln σ((2j−k)λ)]`, `λ = ln(a/(1−a))`). Rents decrease strictly in every case tested (a ∈ {0.6, 0.7, 0.8, 0.9}, n ≤ 30) and the ratio `rent_{k+1}/rent_k` rises toward `e^{−C}`, `C = −ln(2√(a(1−a)))`, staying below it (a=0.7, k=29: 0.905 vs 0.917; a=0.8: 0.786 vs 0.800). The gap is a polynomial correction; we verify the bound numerically, not analytically. Consequence: late seats are worth exponentially little, so getting the last verifiers requires exponentially more liquidity (Result 4).

## Result 3: order moves the rent, not the total
By the chain rule the total is order-invariant, so ordering is a pure transfer. Accuracies [0.9, 0.7, 0.6, 0.55]: best-first rents (0.368, 0.030, 0.007, 0.002), worst-first (0.005, 0.020, 0.078, 0.303), both totalling 0.4067. A verifier is strictly better off first: a 0.8-accurate trader earns 0.193 first, 0.164 behind a 0.7-accurate one. So arrival order is contested; a market that lets verifiers race for position pays for speed, not for information, unless order is randomised or sealed (`verifier-cascades`).

## Result 4: what a subsidy buys
With entry cost `c` per verifier, seats fill until `b·rent_n(1) < c`. At a=0.7, c=0.005: b=0.1→4 verifiers (78% accurate), 0.25→11 (92%), 1→25 (98.3%), 5→41 (99.6%). Break-even liquidity for the n-th seat is `c / rent_n(1)`: 0.109 for n=5, 0.657 for n=21, 4.81 for n=41. Error falls roughly like `1/b` (0.0175 at b=1, 0.0036 at b=5), i.e. paying more buys accuracy only polynomially. The expected loss is 71% of `b ln 2` at n=11 (b=0.25) rising to 98.5% at n=41 (b=5), so the worst-case subsidy is a sound budget, and the entrants' own cost is small next to it (0.125 vs 0.64 at b=1).

## Limitations
Myopic Bayesian traders, symmetric independent signals, one trade each, no fees or slippage, entry cost paid up front. Monotonicity of rents and the limiting ratio are numerical, not proved. Complementary or correlated signals, strategic delay and repeated trading can change the ordering of rents.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (8 tests) and `PYTHONPATH=src python3 experiments/run.py`.
