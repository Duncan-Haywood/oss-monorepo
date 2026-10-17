# Who Pays for the Information? Manipulating an LMSR Verification Market

*Stylised model; MIT licensed. Code: `src/market_manipulation`, results: `experiments/results.txt`. Builds on Hanson and Oprea's observation that manipulators can improve information markets, applied to prediction-market verification of decentralised ML jobs (`decentralized-verification-markets`, `verifier-bribery`).*

## Abstract
A binary LMSR with liquidity `b` prices the event `Y=1` "the claimed training result is valid" (prior `q<½`; the decision is *accept* iff the final price is `≥½`). With probability `μ` an uninformed manipulator pushes the price to `τ≥½` to get a bad result accepted; then `N` potential informed traders, each able to learn `Y` at cost `c`, choose whether to enter in a symmetric mixed equilibrium. We prove three exact facts. (i) The manipulator's expected loss is `b·KL(q‖τ)`, linear in `b`, and equals *exactly* the extra rent the manipulation gives informed traders: manipulation is a subsidy for information acquisition. (ii) The change in decision accuracy is `μ[e₁(1−q) − e₀q − (1−2q)]` with `e₀,e₁` the entry probabilities at prices `q,τ`. (iii) This is positive only in a liquidity band: below it no one enters and manipulation costs `1−2q` accuracy per manipulated market; above `b_hi = Nc/(H(q) − ln(1/(1−ε)))` entry is certain either way and manipulation is neutral. An executable LMSR Monte Carlo matches every formula.

## 1. Model
LMSR cost `C(x,y)=b ln(e^{x/b}+e^{y/b})`, price `p = 1/(1+e^{(y−x)/b})`. The market opens at `p=q`. A trader with belief `r` who moves the price from `p₀` to `p₁` and holds to resolution earns in expectation `b(KL(r‖p₀) − KL(r‖p₁))` (exact; tested against the cost function). A manipulator with no information has `r=q` in expectation. After any manipulation, `N` potential informed traders observe the price, and each independently enters with probability `s`, paying `c`; an entrant learns `Y` and the first one trades the price to `1−ε` or `ε`, so the total rent at price `p` is `R(p) = b(H(q,p) − ln(1/(1−ε)))` with `H` the cross entropy. Rent is shared equally in expectation (random order). The mixed equilibrium solves `R(1−(1−s)^N)/(Ns) = c`, giving `P(anyone enters) = e(R) = cNs/R` when `c<R<Nc`, 0 below, 1 above.

## 2. Manipulation is a transfer to the informed
Moving `q→τ` costs the uninformed manipulator `b(KL(q‖τ) − KL(q‖q)) = b·KL(q‖τ)`. The informed trader's rent at `τ` exceeds that at `q` by `b(H(q,τ) − H(q,q)) = b·KL(q‖τ)`. The two are identical (E1: 0.01838, 0.09189, 0.36757 at `b=0.1,0.5,2`): every unit the manipulator loses is a unit of extra rent for the people who fix the price. A manipulator who *knows* `Y=0` pays more, `b ln((1−q)/(1−τ))` (0.0560 vs 0.0184 at `b=0.1`), with no expected recoup, but he also reveals nothing the informed can exploit differently; the uninformed case is the benchmark for a noise-trading attacker.

## 3. Accuracy change
Without manipulation the price stays `q<½` (reject): correct w.p. `e₀ + (1−e₀)(1−q)`. With it the price is `τ` (accept): correct w.p. `e₁ + (1−e₁)q`. Hence accuracy is linear in `μ` with slope
`e₁(1−q) − e₀q − (1−2q)`.
Three regimes in `b` (E2, `q=.3, τ=.6, N=5, c=.05, ε=.01`):
* **Thin (no entry):** `e₀=e₁=0`, slope `−(1−2q) = −0.40`: at `μ=.5` accuracy falls from 0.70 to 0.50. Manipulation simply works.
* **Band:** entry is partial without manipulation and more likely with it; slope is positive for `b∈(0.107, 0.413)` (E2 peak +0.014 at `b=.15`: 0.9495→0.9565 at `μ=.5`). The lower edge is where `e₁(1−q)−e₀q = 1−2q` (0.107; inside it, at `b=.1`, the slope is −0.007 even though entry rose from 0.38 to 0.73).
* **Deep (certain entry):** `e₀=e₁=1`, slope 0. The upper edge is closed form, `b_hi = Nc/(H(q)−ln(1/(1−ε))) = 0.416` (grid: 0.413).
Raising the target `τ` widens the band downward (lower edge 0.213, 0.107, 0.065, 0.042 for `τ=.5,.6,.75,.9`, E4) because a bigger push pays informed traders more, at proportionally higher manipulator cost.

## 4. Verification
Executable LMSR simulation with sequential trades (E3): at `b=0.15`, `μ=.5`, 150k trials, accuracy 0.9558 vs 0.9565, entry at `τ` 0.946 vs 0.948, manipulator loss 0.0277 vs 0.0276, mean entrant net profit +0.0001 (zero-profit entry condition holds).

## 5. Limitations
Uninformed, non-adaptive manipulator; a single push before entry (a manipulator who watches and re-trades, or who knows `Y`, faces a different game); entrants learn `Y` perfectly and rent is split without strategic timing; the informed do not condition on the manipulation probability `μ` in their belief (prices carry no information about `Y`, but `μ`-dependent inference from an out-of-equilibrium jump is ignored); the decision threshold is fixed at ½; entry cost is common. So the result is a mechanism-design statement about *where* manipulation-resistance comes from (liquidity relative to information cost) and a warning that in thin markets it does not, not an empirical claim about deployed markets. Practical reading: set `b` so that unmanipulated rent already exceeds `Nc`; below that the market is bribable at cost `b·KL(q‖τ)`, which is small precisely when `b` is small.

## Reproduce
`PYTHONPATH=src python3 -m unittest discover -s tests -v` (9 tests) and `PYTHONPATH=src python3 experiments/run.py`.
