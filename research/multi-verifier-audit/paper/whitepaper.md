# Many verifiers, one solver: audit equilibrium, reward splitting and the volunteer's dilemma

*Working note, MIT licensed. Stylised model built on the inspection game of [`verification-game`](../../verification-game)
and the dynamics of [`audit-dynamics`](../../audit-dynamics). The ingredients (volunteer's dilemma, instability of
symmetric mixed equilibria under gradient-like learning, EXP3 exploration) are classical; the contribution is the
closed forms and measurements for refereed verification with m verifiers. No claims about any deployed protocol.*

## Model
Solver cheats w.p. x (gain s if nobody audits, loses S if anyone does). Verifier i audits w.p. y_i at cost k. A caught
cheat pays reward λS in total (**split** equally among auditors) or λS to each auditor (**bounty**); an unaudited cheat costs
every verifier h. Detection probability `q = 1-∏(1-y_i)`. All code in `src/multi_verifier`.

## Results
**1. Aggregate detection is pinned, individual audit rates are not.** Solver indifference gives `q* = s/(s+S)` for every
m, so per-verifier `y* = 1-(1-q*)^{1/m}`. Verifier indifference then gives, for the split scheme,
`x* = k / ( λS·q*/(m y*) + h(1-y*)^{m-1} )` (using `E[1/(N+1)] = (1-(1-y)^m)/(m y)` for N ~ Bin(m-1,y)) and for the bounty
scheme `x* = k / ( λS + h(1-y*)^{m-1} )`. m=1 recovers `k/(λS+h)`. Residuals are 1e-12 in tests.

**2. Redundancy is bounded but real; cheating rises with m.** Expected audits per round divided by `q*` is
`m y*/q*`, increasing in m to `ln(1/(1-q*))/q*` (1.116 for s=1,S=4; larger as q*→1). Because `m y*` increases in m and
`(1-y*)^{m-1}=(1-q*)^{(m-1)/m}` decreases, the split-scheme denominator falls and **the equilibrium cheat rate x* strictly
increases with m** (tested for m=1..29): 0.083 (m=1), 0.090 (2), 0.094 (5), 0.096 (64), because each verifier's share of a catch is
diluted. The bounty scheme has the same detection but a payout that grows with the number of auditors. Adding verifiers
does not buy safety, only redundancy.

**3. The symmetric equilibrium is unstable under Hedge for m ≥ 2.** In log-odds coordinates a verifier's advantage does
not depend on its own audit rate and falls with others' (strategic substitutes). Linearising: shifting effort between
verifiers has eigenvalue `-∂g_i/∂θ_j > 0` (0.034 for m=2, 0.023 for m=3, split), the common mode has trace < 0 and
det > 0, m=1 is the conservative centre of `audit-dynamics`. So the symmetric point is a saddle: it repels along
"who audits" directions.

**4. Hedge dynamics concentrate the audit burden on one verifier; detection cycles. (Corrected, quality round 98.)**
The original version of this result said m=3 ends with verifiers (0.106, 0, 0.106) and m=5 with (0.072, 0, 0.072, 0,
0.072), a committee of 2 or 3 that keeps per-round detection near q* (collapse below q*/2 in 0.3–1.6% of rounds) and so
damps the cycling of `audit-dynamics`. That was an artefact of the start: `experiments/run.py` gives verifiers 0, 2 (and 4)
exactly the same starting audit rate, full-information Hedge is deterministic, and the tie never breaks. Nudging one
starting rate by 0.1% sends m=3 to (0, 0, 0.256), a single auditor (`tests/test_multi.py`,
`test_hedge_untied_start_ends_with_one_auditor`); an independent audit found every one of 16 random starts ends with one
auditor and detection below q*/2 in 4–44% of rounds, and the m=3 case below q*/2 in 48% of rounds over 200,000 steps
(`portfolio/quality/audits/2026-11-22-multi-verifier-audit.json`). Result 3 predicts this: a committee of two is itself a
saddle. What survives: Hedge drives most verifiers to free-ride at y=0; it does not damp the cycling. The table printed
by `run.py` section 2 still uses the tied start and should be read as that special case.

**5. Bandit feedback needs exploration.** With importance-weighted updates and steps `η0/√t` (η0=0.3, T=2e5, 3 seeds),
the learners with no exploration floor are absorbed at "nobody cheats, nobody audits" for m=2,4 (avg q 0.039, 0.000) and
overshoot for m=1 (q 0.64). With an EXP3-style floor γ=0.02 all m track equilibrium: avg cheat rate 0.078/0.090/0.090 vs
x* 0.083/0.090/0.093, avg detection 0.212–0.215 vs 0.2 (the floor biases audit up slightly). A protocol whose
participants learn from their own realised outcomes should therefore *mandate a minimum audit/cheat-probing rate*,
e.g. random spot-checks, so that the "honest world" is not absorbing.

## Design implications
Prefer assigned auditors with committed rotation (or randomly assigned auditors) over an open crowd whose audit effort
is left to emerge; under open participation expect one de facto auditor and detection that still cycles (result 4,
corrected). Split rewards dilute incentives and raise equilibrium cheating slightly; a bounty per auditor reduces the
rise (x* 0.083 to 0.089 at m=64, against 0.096 under split rewards) but does not remove it, and leaks budget. Include an exogenous audit floor.

## Limitations
Symmetric verifiers with equal costs; full-information Hedge in the stability analysis; linearisation in logit
coordinates (discrete-step and finite-η effects are only measured, not proved); the m≥3 concentration is measured
at η=0.02 from a handful of starts and a partition of who audits is not characterised in general; no coalitions
(see `verifier-bribery`), no verifier heterogeneity, no learning of k. Bandit runs use 3 seeds, no confidence intervals.

## References
Diekmann, *Volunteer's dilemma* (J. Conflict Resolution 1985); Bailey & Piliouras (EC 2018); Auer et al., *The
nonstochastic multiarmed bandit problem* (SICOMP 2002); Daskalakis et al., *Training GANs with Optimism* (ICLR 2018).
Not yet engaged (flagged in quality round 98, citations from an auditor's memory, to check): multi-inspector inspection
games (Avenhaus, von Stengel and Zamir 2002); the verifier's dilemma (Luu et al., CCS 2015); Truebit (Teutsch and
Reitwiessner 2017), whose forced errors are an audit floor; Kleinberg, Piliouras and Tardos (STOC 2009) on
multiplicative weights and mixed equilibria.
