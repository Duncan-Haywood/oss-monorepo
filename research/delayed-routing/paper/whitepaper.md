# Routing Modular Experts When Feedback Is Late: Delayed Hedge and LMSR Liquidity

*Stylised model; MIT licensed. Code: `src/delayed_routing`, results: `experiments/results.txt`.*

## Abstract
Cost-function markets route to modular experts by Hedge/LMSR (see `market-routing`), but on a network of heterogeneous devices the loss of a round is only known after a device-dependent delay. We give a short exact regret bound for fixed-rate Hedge with delayed feedback, `R ≤ ln N/η + ηT/8 + ηD/2`, where `D` is the sum over decisions of the number of rounds whose feedback is still missing. Tuned, this is `2√(ln N (T/8 + D/2))`: a mean delay `d̄` inflates the effective horizon by `1+4d̄`, i.e. regret by `√(1+4d̄)`. The bound is verified on random sequences and against an adaptive adversary. Experiments show (i) the bound is loose by 2–5× on stochastic data, (ii) ignoring delay costs 12× regret against a punish-the-leader adversary at delay 100, (iii) on oblivious data the worst-case delay-tuned rate is too cautious (a delay-blind rate wins), (iv) a rate built from observable outstanding counts recovers most of that, and (v) for an LMSR router the liquidity subsidy for a fixed per-round regret target grows about 20× at mean delay 5.

## 1. Model
N experts, T rounds, losses in [0,1]^N. Round t's loss vector becomes usable at decision time `t+1+δ_t`. Let `d_t` be the number of rounds `s<t` not yet usable at `t` and `D = Σ_t d_t` (at most `Σδ_t`). The learner plays `p_t ∝ exp(−η L_t)` with `L_t` the sum of *arrived* losses. LMSR with liquidity `b=1/η` is exactly this rule, worst-case market-maker loss `b ln N`.

## 2. Bound
Let `q_t` be the play of undelayed Hedge on the same losses. Standard analysis gives regret of `q` at most `ln N/η + ηT/8`. The delayed weight of expert i differs from the undelayed one by a factor `exp(η m_i)` with `m_i ∈ [0, d_t]` (sum of missing losses), so the log-likelihood ratio between `p_t` and `q_t` has spread at most `ηd_t`, giving total variation at most `tanh(ηd_t/2) ≤ ηd_t/2`, hence `|⟨p_t−q_t, ℓ_t⟩| ≤ ηd_t/2`. Summing:

**R ≤ ln N/η + ηT/8 + ηD/2.**

Tuning `η* = √(ln N/(T/8 + D/2))` gives `2√(ln N·(T/8+D/2))`. With `D = d̄T` the bound is the undelayed one times `√(1+4d̄)`. This is the known `√(T+D)` delayed-feedback rate (Weinberger–Ordentlich; Quanrud–Khashabi; Joulani et al.) with explicit constants for this proof. Tests check the inequality on 30 random loss/delay sequences × 4 rates and against the adaptive adversary.

## 3. Experiments (T=4000, N=8 unless stated; 8 seeds)
**Tightness (E1).** Regret/bound is 0.53–0.56 undelayed and falls to 0.21–0.25 at mean delay 100: the `D` term is a worst case that stochastic sequences do not realise.

**Adaptive adversary (E2).** Punish-the-leader, N=2, constant delay d. Delay-blind Hedge (η=√(8 ln N/T)) has regret 18.6, 67, 199, 548, 1259 at d=0,3,10,30,100; delay-tuned has 18.6, 19, 36, 64, 101: a 12× gap at d=100. The tuned bound grows exactly `√(1+4d)`. Delay is dangerous exactly when the environment reacts to the router's stale beliefs.

**Heterogeneous fleets (E3).** At equal `D`, a few very slow devices (2% at delay 500) gave regret 146±14 versus 176±14 for geometric delays with the same mean; a uniform delay of 10 gave 178±14. The bound depends only on `D`, and measured regret is if anything slightly lower when delay is concentrated in a few devices, but the differences are at about one standard error, so we claim only that mean delay is the right summary.

**Rate rules (E4).** Mean delay 20, oblivious switching losses. Delay-blind 122±11, oracle-tuned `η*(D)` 215±19, adaptive rate `η_t=√(ln N/(t/8+ΣD_t/2+1))` using only observed outstanding counts 154±19, 3× too big 166±6, 3× too small 246±26. Honest reading: `η*` is minimax and therefore conservative; on non-adversarial data slowing the learner because of delay costs regret. The adaptive rule needs no knowledge of `D` but has no proof here (time-varying rate).

**Subsidy (E5).** A router that needs per-round regret ≤ 0.05 at N=8 needs `T* = 4 ln N (1/8+d̄/2)/0.05²` rounds: 416 (d̄=0), 8,734 (5), 33,687 (20), 166,771 (100). Equivalently its liquidity `b=1/η*` and worst-case subsidy `b ln N` rise from 10 to 218 (d̄=5) to 4,169 (d̄=100).

## Limitations and relevance
Delays are exogenous and independent of losses; a real adversary can also control which device reports late, and delayed *stake* (not only delayed information) is unmodelled. The bound is an upper bound, no matching lower bound is shown here. The adaptive rate is empirical. For decentralised modular ML the message is operational: measure outstanding-feedback counts, feed them into the market's liquidity, and expect subsidy to scale with `1+4d̄`; pair with `market-routing` (LMSR=Hedge) and `wagering-modular-experts`.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests` (11 tests) and `PYTHONPATH=src python3 experiments/run.py`.
