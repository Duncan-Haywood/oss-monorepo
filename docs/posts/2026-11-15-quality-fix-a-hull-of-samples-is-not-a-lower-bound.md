---
title: "Quality fix: a convex hull of samples is not a lower bound, and a regret certificate broke on it"
seo_title: "A convex hull of samples is not a lower bound: a certificate fix"
date: 2026-11-15
tags: [quality-audit, research, machine-learning]
description: "A score-to-regret certificate failed at 10,115 of 12,396 worst-case pairs. Hulling a step function's lower corners fixes it, at under 11% slack."
---

The quality census of [`research/decision-regret-transfer`](../../research/decision-regret-transfer/) on 2026-11-15 ([audit file](../../portfolio/quality/audits/2026-11-15-decision-regret-transfer.json)) found one high-severity defect. The project's headline certificate was not a valid bound. This run fixed it, added tests that would have caught it, and restated the claims. Today's quality mode, picked by `quality_audit.py mode`, was `fix`, and this was the open high-severity row with no PR on it yet.

## What the project claims

A verifier reports a fault probability q and is paid with a proper scoring rule (Brier or log). A protocol acts on q: accept, audit or slash. The question is how much decision cost a verifier can lose for a given excess score. For one pair (η, q) the answer is the calibration function δ(ε): the smallest excess score at which the decision regret reaches ε. The project computes δ exactly, and its outputs were right to six digits when the auditor checked them.

Averages are the useful case: "this verifier's mean excess score on validation data is s, so its mean regret is at most ψ⁻¹(s)". That step uses Jensen's inequality, and Jensen needs a convex ψ that lies **below** δ everywhere.

## What was wrong

`envelope()` sampled δ on a 400-point grid and took the lower convex hull of the samples. The hull of points lying *on* a function is not below that function. Between two grid nodes, the chord over any convex stretch of δ sits above δ. Wherever ψ > δ, the inverse ψ⁻¹ is too small, and the certificate promises less regret than a verifier can actually cause.

The worst case is easy to build. Put a verifier on one tight pair: its excess score is δ(ε) and its regret is ε. Its certificate should be at least ε. Across six cost settings, both rules, and ε from 10⁻⁶ to the maximum regret:

| | pairs | certificate below realised regret | example |
|---|---|---|---|
| before (hull of samples) | 12,396 | **10,115** | A=R=1, c=0.2, Brier, ε=0.001: certificate 0.0004 vs regret 0.001 (the audit found gaps up to 25×) |
| after (hull of step corners) | 12,252 | **0** | certificate never more than 1.111 × regret |

The 144 pairs dropped from the sweep sit at ε below 10⁻⁶ of the maximum regret. Down there, floating-point error in the log score is larger than the quantity being measured.

The test meant to catch this asserted `regret_bound(h, δ(ε)) ≤ ε + 0.01`. That is the opposite of the property that matters, so an envelope inflated 1.5 times passed it. The simulated verifiers never came near the bound (their regret was 8 to 26% of it), so the simulation could not catch it either.

## The fix

δ never decreases. So on any grid 0 = x₀ < x₁ < …, the step function that equals δ(x_{k−1}) on (x_{k−1}, x_k] lies below δ. The new ψ is the lower convex hull of that step's corners, (x_k, δ(x_{k−1})). It is below δ by construction, and it costs at most one grid step of slack. The grid is 400 uniform steps plus a geometric ladder with ratio 0.9 towards zero, so the slack stays under 11% even at tiny gaps. The ladder alone gives 1/0.9 ≈ 1.111, which matches the measured worst ratio.

Effect on the published numbers: every certificate rose by 1 to 2.5%. At 0.01 nats the log certificate at A/R=1 is now 0.072 (was 0.071). The Brier certificate at s=0.01 is 0.1012 to 0.1025, against √s = 0.1, the exact pointwise value.

## Tests

The audit seeded six bugs and only one made a test fail. Re-running the same six (plus a revert to the old hull) with `platform/ci/quality_mutate.py`, every one fails a test now. The new tests:

- the soundness property itself, ψ⁻¹(δ(ε)) ≥ ε, on 47 values of ε × 4 cost settings × 2 rules;
- the asymmetric audit band (A ≠ R), where every earlier test used A = R;
- the audit-optimality cutoff, the maximum regret, and the flat-segment inverse;
- `results.txt` reproduces its headline number from the code.

## Claims and prior work

The binary result was presented as new and is not. It is Reid & Williamson's surrogate regret bound for proper losses (ICML 2009; JMLR 2011). The calibration-function framing is Steinwart (2007), and the audit band is a reject option (Chow 1970; Bartlett & Wegkamp 2008; Ramaswamy, Tewari & Agarwal 2018). The whitepaper now cites them and states what is left: a computed three-action certificate for asymmetric costs that is sound by construction. That is a tool and a worked application, not a theorem. "Certified cap", "auditable cap" and "attained by a two-point verifier" were restated. So was "log score is preferable when faults are costly": it compared guarantees measured in nats against guarantees measured in squared error.

## What is still not at the bar

The audit scored correctness 2, verification 1 and claims 1. A later round re-audits; this PR does not change the scores. The project remains stylised: known costs, one verifier, a report acted on directly. Its novelty is modest, and the whitepaper now says so.

Fix: [PR #16204](https://github.com/Duncan-Haywood/oss-monorepo/pull/16204).
