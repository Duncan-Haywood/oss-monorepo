# Audit dynamics: do verifiers and solvers learn the inspection equilibrium?

*Working note, MIT licensed. Stylised model; the game-theoretic ingredients (zero-sum equivalence, Hedge divergence,
optimistic convergence) are known results; the contribution is the closed forms and measurements for the
verification game. No claims about any deployed protocol.*

## Motivation
`verification-game` shows the refereed-verification inspection game has a unique mixed equilibrium: cheat rate
`x* = k/(λS+h)`, audit rate `y* = s/(s+S)`. Deployed networks do not solve games; participants adapt.
If adaptation cycles instead of converging, the audit rate a protocol designer relies on may never be realised
in any given round.

## Model
Solver cheats w.p. x (gain s if unchecked, loses S if checked); verifier checks w.p. y (cost k, reward λS on a
caught cheat, harm h if a cheat goes unchecked). Advantages: cheat over honest `(s+S)(y*-y)`; check over skip
`(λS+h)(x-x*)`. Both players run Hedge on these advantages.

## Results
**1. Strategic zero-sum.** With learning rates `η(λS+h)` (solver) and `η(s+S)` (verifier) the payoffs equal
`∓C(x-x*)(y-y*)` up to terms in the player's own action only, `C=(s+S)(λS+h)`. So Hedge behaves as in a zero-sum game.

**2. Conserved potential.** The continuous flow conserves `H = KL(x*||x)+KL(y*||y)` (RK4 check: 0.03190 → 0.03190).
Discrete Hedge *increases* H monotonically (tested, η ≤ 0.05): trajectories spiral away from equilibrium
(Bailey–Piliouras 2018 for zero-sum games).

**3. Closed-form period.** Linearising, `ω = C√(x*(1-x*)y*(1-y*))` per unit η, so oscillations have period
`2π/(ηω)` rounds. Example s=1, S=4, k=0.5: predicted/measured 1813.8/1814.3, 725.5/725.9, 362.8/362.9 for η=.002/.005/.01.
Implication: adaptation on timescale shorter than the period looks like the equilibrium; anything slower sees cycles.

**4. Averages converge, iterates do not.** Time-average cheat and audit rates are within ~0.01 of (x*,y*) (T=1000–64000,
η=.05), and `mean(x_t y_t)` is within 3% of `x*y*`. But per-round behaviour is far from equilibrium: for η ≥ 0.02,
audit probability is below `y*/2` in 65–76% of rounds and the solver's cheat probability exceeds `2x*` in ~23%
(η=.02: last iterate is (0.97, 0.000)). A protocol that budgets a *rate* is fine on average, but any per-epoch
guarantee (or an attacker timing a cheat when audit probability has collapsed) is not.

**5. Optimism fixes the last iterate.** Optimistic Hedge (η=0.1) reaches `|x-x*|=5e-9` by T=1000 and machine
precision by T=3000, from the same start where plain Hedge spirals to the boundary (H: 0.03 → 8.5).

**6. Sampled actions.** Hedge against realised (not expected) opponent actions with η_t = η0/√t: empirical
frequencies converge (error 0.040 → 0.014 → 0.0065 at T=1e3, 1e4, 1e5 for x) but the last iterate stays noisy
(0.25–0.39 error at T=1e5). Decreasing steps alone do not give last-iterate convergence at these horizons.

**7. Stake.** With a scale-free step (η·C fixed) raising S shrinks x*, y* proportionally but did not change the
relative stability materially in our runs (small perturbations, T=5000). Stake choice does not substitute for
step-size or optimism.

## Design implications
Publish the audit-rate as a *committed schedule or smoothed rate* rather than letting best-response-style
adaptation set it; use optimistic/predictive updates (e.g. verifiers who forecast solver behaviour) or damp
step sizes below `1/(ω·horizon)`; do not treat the equilibrium as a per-round guarantee.

## Limitations
2×2 game, full-information Hedge, expected payoffs, matched rates (unmatched rates are not covered by the
zero-sum equivalence), one solver and one verifier, no bandit feedback, logits clamped at ±40, no proof
that monotonicity holds for all η (violated numerically only at the clamp). Follow-ups: bandit (EXP3) feedback,
m verifiers with reward splitting, heterogeneous learning rates, coupling with the drift/tolerance model.

## References
Bailey & Piliouras, *Multiplicative Weights Update in Zero-Sum Games* (EC 2018); Daskalakis, Ilyas, Syrgkanis,
Zeng, *Training GANs with Optimism* (ICLR 2018); Wei et al., *Linear last-iterate convergence in constrained
saddle-point optimization* (ICLR 2021); Mertikopoulos, Papadimitriou, Piliouras, *Cycles in adversarial regularized
learning* (SODA 2018); other packages in this monorepo.
