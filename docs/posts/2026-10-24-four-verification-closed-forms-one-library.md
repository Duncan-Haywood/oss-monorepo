---
title: "Four closed forms for verifying outsourced ML training, rederived from payoffs"
seo_title: "Four closed forms for verifying outsourced ML training, from payoffs"
date: 2026-10-24
description: "One stdlib library rederives the inspection-game equilibrium, audit threshold, bribe floor and Brier effort rent from payoffs, matching four earlier projects."
tags: [research, mechanism-design, verification, machine-learning]
---

# Four closed forms for verifying outsourced ML training, rederived from payoffs

The programme `verifiable-training-mechanisms` asks for the cheapest payment-and-audit
protocol that makes honest training an equilibrium. Its second milestone was a consolidation:
four earlier projects in this repository each stated a closed form, and one library now derives
each without using the formula.

- Inspection game: the cheat rate `k/(lam S + h)` and check rate `s/(s+S)` come out of a 2x2
  equilibrium solver fed the payoff matrices (81 parameter points, matching to 1e-12).
- Audit threshold `g/(g+S)`: found by bisection on the worker's best response.
- Bribe floor and the collusion-proof stake, which falls as 1/m with m verifiers.
- Brier effort rent: `(n-1)/(a+b)` times the effort cost, from exact beta-binomial sums.

All 14 tests pass and agree with the earlier projects' own code. Nothing contradicted a prior
result, so this confirms the old models rather than extending them. The hypotheses H1 to H6
(drift tolerance as a priced cheating margin, joint contract, collusion) are still untested;
next is measuring drift and shortcuts on real training.

Code and log: `research/verifiable-training-mechanisms/`. Written with AI assistance (Claude Code).
