# The economics of refereed verification: stakes, free-riding verifiers and floating-point drift

*Working note, MIT licensed. Small stylised model; no empirical claims about any deployed protocol.*

## Motivation
Decentralised training networks (e.g. Gensyn) verify work optimistically: a solver posts a result and a
stake, verifiers may re-execute, and a refereed bisection game (Verde-style) pins any disagreement to one
operator. Two frictions determine whether this is cheap and safe: (i) verifiers are paid only when they catch
something, so if cheating is rare nobody checks (the *verifier's dilemma*, Luu et al. 2015; Truebit's forced-error
"jackpots"), and (ii) honest replicas disagree numerically unless kernels are bitwise reproducible, so any
tolerance trades false slashes against hidden cheating.

## Model
Solver cheats (saves `s`, loses stake `S` if caught) or is honest. A verifier checks (cost `k`, earns `λS` on a
caught cheat) or skips (harm `h`). Every checked cheat is caught.

**Result 1 (inspection equilibrium).** The unique equilibrium has cheat rate `x* = k/(λS+h)` and check rate
`y* = s/(s+S)` (or `x=1,y=0` when `k ≥ λS+h`). Raising stake reduces *both* cheating and audit cost;
collateral substitutes for re-execution. Tested by indifference conditions and by fictitious play (100k rounds, ±0.03).

**Result 2 (free-riding).** With `m` verifiers splitting the catch reward among checkers, detection is pinned
at `D = s/(s+S)`, per-verifier check rate `1-(1-D)^{1/m}`, and cheat rate `x = k m y/(λS D)`. As `m→∞`
total checking cost → `k ln(1/(1-D))` and `x → k ln(1/(1-D))/(λSD)`: more verifiers do not buy more security,
they dilute rewards; cheat rate rises monotonically in `m` but saturates (example S=4: 0.25 → 0.279).
Verified numerically to 3 decimals.

**Result 3 (jackpots vs stake).** With planted faults at rate `φ` paying `J`, a lone verifier checks always iff
`φJ ≥ k − (1−φ)ε(λS+h)`. Stake lowers the required subsidy linearly in `ε(λS)`; jackpots are the fallback when
solver collateral is capped, and cost at least `k` per task when `ε→0` — i.e. they are just paid verification.

**Result 4 (drift design).** Honest drift `~N(0,σ²)`, dispute when `|d|>τ`, false slash `p(τ)=erfc(τ/σ√2)`;
a cheater hides deviation `τ` (saving `κτ`, harm `ρτ`). Constraints: honest participation `margin ≥ p(τ)S`
and cheat rate `k/(λS) ≤ ε`. Minimising audit + dispute + hidden-harm + capital cost over `(τ,S)` gives:

| σ | τ* | S* | false-slash | cheat | audit | loss |
|---|---|---|---|---|---|---|
| 0.5 | 1.4 | 19.5 | .0051 | .005 | .067 | .083 |
| 1 | 2.7 | 27.0 | .0069 | .004 | .091 | .115 |
| 2 | 5.2 | 37.5 | .0093 | .003 | .122 | .160 |
| 4 | 9.7 | 51.0 | .0153 | .002 | .160 | .220 |

Loss grows roughly linearly in hardware noise, so bitwise-reproducible operators (RepOps) are worth
approximately their noise-reduction factor in protocol overhead; τ* ≈ 2.7σ, S* grows sublinearly.

## Limitations
One solver-type, perfect referee, Gaussian drift, linear hiding gain/harm, risk-neutral agents, exogenous
capital cost, no collusion (solver–verifier collusion would break Result 1). The numbers are illustrative of
comparative statics, not calibrated. Follow-ups: heterogeneous verifier costs, collusion-proofness via
Bo Waggoner-style peer-prediction rewards for verifiers, heavy-tailed drift, tolerance elicited by quantile scoring.

## References
Luu et al., *Demystifying Incentives in the Consensus Computer* (2015); Teutsch & Reitwiessner, *A scalable verification solution for blockchains* (2019);
Gensyn, *Verde* (2025); Frongillo et al. on property elicitation; other packages in this monorepo.
