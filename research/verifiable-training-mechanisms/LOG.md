# Research log: verifiable-training-mechanisms

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 2: one library reproducing four earlier projects
- Hypothesis written before running: the closed forms of `verification-game` (`x = k/(lam S + h)`, `y = s/(s+S)`), `audit-allocation` (`t = g/(g+S)`), `verifier-bribery` (bribe floor and the 1/m collusion-proof stake) and `effort-elicitation` (Brier value `V(n) = Var(p) n/(a+b+n)`, rent per cost `(n-1)/(a+b)`) follow from payoffs alone, so a library that derives each numerically (2x2 equilibrium from matrices, bisection on best responses, exact beta-binomial sums) should match each formula to 1e-6 or better and match the earlier projects' code. A mismatch would mean one of the earlier projects is wrong.
- Result: `src/vtm/` (stdlib only) and 14 tests pass. The matrix-derived inspection equilibrium equals the closed form on 81 grid points with checking worthwhile (the dominant-cheating region is a separate test); the bisected audit threshold and bribe floor equal their formulas; the Brier rent law holds exactly; every figure agrees with the earlier projects' own functions. No mismatch found: the four closed forms are confirmed, not extended.
- Not done: this is a consolidation. The shared model of effort, a tolerance tau and a held-out score (the method section) is not built, so H1 to H6 are untested. The proposal's open item (whether Verde or proof-of-learning already price the tolerance) is not yet read.
- Next: milestone 3, drift and the shortcut margin on real training (needs numpy or torch: probe the environment first).

## 2026-10-24 · Programme opened
- Wrote `PROPOSAL.md`: 17 references looked up on arXiv and Crossref (one wrong arXiv id, 1611.03158, and one near-miss, 1603.07319, were caught and replaced by 1606.07042, the Gao et al. paper), six falsifiable hypotheses H1 to H6, seven milestones, target ACM EC.
- Prior work here: about 60 scoring, effort, audit, game and verifier projects, each stylised. The claim of novelty is narrow: the tolerance as a priced cheating margin, a joint contract with a cost frontier, collusion on a shared shortcut, and measurement on real training.
- Not yet checked: whether Verde or the proof-of-learning papers already price the tolerance (read their full text at milestone 2, before building on gap item 1).
- Next: milestone 2, one library reproducing the closed forms of `verification-game`, `audit-allocation`, `verifier-bribery` and `effort-elicitation` as tests.
