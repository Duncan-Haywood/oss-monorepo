# Audit staffing: sizing the verifier pool that stake-based deterrence requires

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
Refereed-verification protocols (`spot-check-slashing`, `audit-allocation`, `verification-game`) say what fraction of jobs must be audited to deter cheating, `a = G/(G+S)`, but not what it takes to run that audit stream. I treat the audit pool as an M/G/c queue with offered load `R = λ a s` and give (i) exact Erlang-C waiting, verified against simulation to within simulation noise; (ii) Halfin–Whitt square-root staffing, `c = R + β√R` with `β = 1.06` for P(wait) ≤ 0.2, which is within 1.5 servers of the exact minimum for R ≥ 100 and means the spare capacity needed falls like `1/√R` (60% at R=5, 11% at 100, 1.1% at 10⁴); (iii) a first-order stake–capacity trade-off with optimum `G+S* = √(w s G/(r d₀))`, within 14% of the exact integer-staffed optimum across a 64-fold range of capital cost; and (iv) two failures of standard approximations: Allen–Cunneen overstates delay for heavy-tailed audit times (0.97 vs 0.63 at lognormal σ=1.5) and understates it for bursty audit demand (0.82 vs 1.45 at batch size 4).

## 1. Model
Jobs arrive at rate `λ`. Each job carries stake `S` and a would-be cheater gains `G`; auditing with probability `a` makes cheating break-even at `(1−a)G = aS`, so `a = G/(G+S)` deters. Audits are a Poisson thinning of rate `λa`, each occupying a verifier for mean time `s`; `c` verifiers cost `w` each per unit time. Capital: every job locks `S` for a fixed window `d₀` at cost rate `r`, and an audited job keeps it locked for its queueing wait plus service, so by Little's law locked capital is `λS(d₀ + a(Wq+s))`. Cost rate: `w c + r λ S (d₀ + a(Wq+s))`, with `c` the least integer keeping `P(wait) ≤ p`.

## 2. Exact waiting
With offered load `R < c`, Erlang C is `C(c,R) = c B/(c − R(1−B))`, `B` the Erlang-B recursion. Then `E[Wq] = C s/(c−R)` and `P(Wq>t) = C e^{−(c−R)t/s}`. E1 (c=10, R=8): P(wait) 0.4092 exact vs 0.4066 simulated, `E[Wq]` 0.2046 vs 0.2021, `P(Wq>1)` 0.0554 vs 0.0544 (200k time units).

## 3. Square-root staffing
`c = R + β√R` gives `P(wait) → [1 + βΦ(β)/φ(β)]^{-1}`; `β=1.062` for 0.2. E2: exact minimal `c` is 111 vs 110.6 at R=100, 525 vs 523.7 at R=500, 10107 vs 10106.2 at R=10⁴. Utilisation at the same service level rises from 0.625 (R=5) to 0.989 (R=10⁴): a small pool needs proportionally much more idle capacity than a large one, so **stake that shrinks R saves proportionally more wage in small pools** (E3 shows the effect).

## 4. Stake versus capacity
Substituting `a` into `R`, `dR/dS = −λ s G/(G+S)²`; a unit of stake saves this much offered load, worth `w(1+β/(2√R))` per unit, while costing `r λ d₀` in locked capital. Ignoring the safety term the optimum is `(G+S)² = w s G/(r d₀)`, so `S* = √(wsG/(rd₀)) − G` (positive only if `w s > r d₀ G`). E3 (λ=100, G=1, s=1, w=1, r=0.01, d₀=1): total cost is 76.8 at S=0.5, 23.9 at S=9, 65.0 at S=60; exact optimum S=9.68 (c=13, cost 23.63), rule 9.00. Across r from 0.0025 to 0.16 the exact/rule ratio is 1.14, 1.08, 1.08, 0.93 (the rule ignores the `β/(2√R)` term and integer rounding) and at r=0.64 both collapse to almost no stake with c≈100 verifiers. Cheap capital pushes work into stake; expensive capital pushes it into headcount.

## 5. When the M/M/c picture is wrong
E4 (c=10, R=8, `E[Wq]`, M/M/c value 0.205): deterministic audits 0.108 (Allen–Cunneen 0.102), exponential 0.205 (0.205), lognormal σ=1 0.250 (0.278), lognormal σ=1.5 0.629 (0.971). Heavy-tailed audit times make the two-moment correction pessimistic. E5: geometric batches (mean b) of simultaneous audits raise `E[Wq]` from 0.204 to 0.587 (b=2) and 1.454 (b=4) and P(wait) from 0.41 to 0.73, more than Allen–Cunneen with `c_a² = E[B²]/E[B]` predicts (0.41, 0.82). Correlated audit demand, such as an epoch of jobs settling together, is the dangerous case for a fixed pool. E6: with each verifier independently up with probability `u` for the period, the extra headcount over the naive `c/u` is −0.4 servers at u=0.95 and +0.9 at u=0.7 (R=20, P(wait) ≤ 0.2).

## 6. Implications
(i) The audit rate that stake buys is a staffing decision: report `(S, c)` together. (ii) Size the pool with `R + β√R`, not the mean load, and use `s`-weighted `R` not the job count. (iii) Do not use two-moment approximations for burst or heavy-tailed audit demand; simulate or hold back-pressure. (iv) Randomised audit lotteries (`committee-sampling`) keep the thinning Poisson; audits chosen after a burst of settlements do not.

## 7. Limits
FIFO, homogeneous verifiers, i.i.d. service, no abandonment, stake locked for a fixed window plus queueing, static outages, no strategic response of verifiers to queue length (`multi-verifier-audit`, `audit-dynamics` treat that). Costs `w, r, d₀` are stylised. The batch result is measured, not derived. Related: Erlang 1917, Halfin and Whitt 1981, Allen and Cunneen, Little 1961, Gensyn's verification programme. Numbers are single-seed simulations (seeds in `experiments/run.py`).
