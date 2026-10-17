# Bribing the verifiers: a collusion threshold for refereed verification, and why jackpots raise the bribe floor

*Working note, MIT licensed. Stylised model; no empirical claims about any deployed protocol. Follow-up to `../verification-game` (which listed collusion-proofness as open).*

## Motivation
Optimistic/refereed verification of decentralised training (Gensyn's Verde-style referee, Truebit-style verifiers)
is safe if *at least one* verifier checks and reports. The inspection-game analysis showed honest checking is
thin in equilibrium (cheat rate `x* = k/(λS+h)`), so a solver can try to buy silence instead. Two questions:
how much must a bribe cost, and what protocol parameter raises it?

## Model
Per task, the solver really cheats w.p. `x` (saves `s`; stake `S` slashed on a report, a fraction `λ` paid to the
reporter). W.p. `φ` the protocol plants a fault instead, paying `J` to whoever reports it; a checking verifier
(cost `k`) sees a discrepancy in both cases and cannot tell them apart. An unreported real cheat costs each verifier
harm `h`. The solver commits to a cheat rate `x` and offers each of `m` verifiers a bribe `b`, paid only on real
cheats that go unreported; it must buy all `m` (one reporter is enough to slash).

**Result 1 (bribe floor).** Given the others stay silent, a verifier prefers to take the bribe without checking iff
`(1-φ)x(b-h) ≥ (1-φ)xλS + φJ − k`, i.e.

`b*(x) = λS + h + (φJ − k) / ((1−φ)x)`.

With `φ=0, b=0` this is exactly the inspection-game indifference `x = k/(λS+h)`. Without jackpots the floor
*falls* as `x` falls and turns negative: when cheating is rare, verifiers already prefer not to check, so silence
is free. Jackpots that cover checking (`φJ ≥ k`) remove this: the floor is at least `λS+h` at every `x`.

**Result 2 (solver's collusion profit).** Buying silence at the floor gives profit `x(s − m·b*(x)⁺)`. With
`A = m(λS+h)`, `C = m(k−φJ)/(1−φ)`:

- `C ≤ 0` (jackpots pay for checking): `Π = max(0, s − A − |C|)` at `x=1`.
- `C > 0`, `s < A`: `Π = sC/A`, attained at cheat rate `C/A = (k−φJ)/((1−φ)(λS+h))` — the no-collusion rate, so bribery changes the solver's profit but not security.
- `C > 0`, `s ≥ A`: `Π = s − A + C` at **x = 1**. Security fails completely.

So there is a sharp **collusion-proof stake** `S_c = (s − m·bonus)/(mλ) − h/λ`: below it a bribing solver cheats every task;
above it the cheat rate stays at the inspection-game level. `S_c` falls as `1/m` — more verifiers make collusion
linearly more expensive (contrast the free-riding result, where more verifiers only dilute rewards).

**Result 3 (jackpots raise the bar one-for-one).** Each unit of `φJ − k` raises the collusion cost by
`m/(1−φ)` per task. In the table (`s=3, λ=.5, k=.5, φ=.05`), at `S=6` (where `s=A`) profit is 0.526 with no jackpot and 0 once `φJ ≥ k` (J=10).
The price is the jackpot budget `φJ ≥ k` per task: it is *paid verification*, the same cost identified in the previous note.

Numbers (`s=3, λ=.5, k=.5, h=0, m=1`, no jackpots): bribing profit is 2.50, 1.50, 0.50 at `S`=2, 4, 6 (cheat rate 1);
above `S=6` it drops to 0.43, 0.38, 0.25 at `S`=7, 8, 12 with cheat rate 0.14, 0.13, 0.08.

## Verification
`tests/` checks: floor equals indifference; `φ=0` recovers `x*`; the closed-form profit matches an independent
brute force (grid over `x`, floor found by bisection on the payoff functions) on 7 parameter sets; the
stake threshold flips the optimum to `x=1`; `S_c ∝ 1/m`; a Monte-Carlo simulation of tasks matches the payoff formulas. 7 tests.

## Limitations
Silence being an equilibrium is one equilibrium of a coordination game — verifiers could also all report — so the floor is a *lower bound on what the
solver must pay* under the solver's preferred selection. Bribes are conditional on unreported cheats and enforceable
(smart-contract escrow would make them so; a reneging solver would raise the floor). Single solver type, risk-neutral agents,
perfect referee, planted faults indistinguishable, no verifier-verifier side payments, `h` exogenous. Not calibrated.
Next steps: peer-prediction-style rewards (Waggoner-type) so silence is not a coordination equilibrium; heterogeneous check costs;
heavy-tailed drift.

## References
Luu et al. (2015); Teutsch & Reitwiessner (2019); Buterin, *The P+ε attack* (2015); Gensyn, *Verde*; `../verification-game`.
