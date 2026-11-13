---
title: "Quality audit round 62: 0 of 4 at the bar, and a spend cap a PDF link walks past"
seo_title: "Quality audit 62: LLM spend cap, ticket resale, FE corner stress"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. 20 concurrent calls sending a PDF by URL got past an LLM spend guard's $1 budget and spent $15.31."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-h` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 61 had already used seeds `2026-11-13` to `-g`, so this one took `-h`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 262 meet it (Wilson 95% interval 8% to 16%). All four are finished (completeness 3). All four miss on verification. Two also miss on correctness and three on claims.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/llm-spend-guard | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/ticket-resale-profit-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/simdesign-fwdcheck | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/categorical-scores | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| llm-spend-guard | 6 of 8 | 6 of 11 |
| ticket-resale-profit-calculator | 2 of 5 | 4 of 6 |
| simdesign-fwdcheck | 0 of 4 | 5 of 7 |
| categorical-scores | 3 of 6 | 6 of 7 |

The tests caught 11 of 23 seeded bugs (round 61: 6 of 16).

I re-checked four of the auditors' findings myself:

- **Ticket resale.** An unquoted `$1,200.00` turned into a cost of $1 and a 19,800% ROI.
- **Spend guard.** A 100-page PDF sent by URL was estimated at 59 input tokens.
- **L-bracket stress.** I worked the 2.0 mm bracket's beam-theory stress by hand: 4.2 MPa axial plus 158.6 MPa bending, 162.8 MPa in all, the same as the table.
- **Scoring rules.** The dropped-rare-class figure for the log score is ρ·ln(ρ/ε) − (1−ρ)·ln(1/(1−ρ)) = 0.151, and it only takes that value because the report floors the dropped class at ε = 1e-9.

## Verdicts and worst defects

### ventures/llm-spend-guard (correctness 2, claims 2)

The reviewer is a platform engineer who runs LLM API cost controls. Most of the core works:

- Costs match the published per-token prices for Claude Sonnet 4.5 and gpt-4o, cached tokens included.
- Both providers' streaming usage formats are read correctly.
- 20 concurrent text calls against a $0.05 budget let exactly 3 through and refused 17 with HTTP 402.
- It fails closed: a model with no price is refused, and so is a call with no output cap.

**The worst defect (high, scope gap):** before a call goes out, the guard reserves money against the budget (a "hold"). The hold's input estimate is the request's JSON bytes divided by 3. An image or document sent by URL or file id is a few dozen bytes of JSON and thousands of tokens upstream. So 20 concurrent calls that each sent a PDF by URL each reserved about $0.016, all got past a $1 per-user budget, and spent $15.31. The README, the page and the how-to guide all said a budget is "never promised twice", with no limits stated. OpenAI's `n` parameter (several answers per call) also got past: the hold covers one answer, and OpenAI bills output for every answer.

**Fixed in this PR:**

- The proxy refuses `n` above 1 before the call goes upstream.
- A new test checks that a stream the provider cuts off is charged its whole hold. A seeded bug there had survived.
- The guarantee now says it holds for text input, in all five places it appeared. The hypothesis in `VENTURE.yaml` is marked `refuted`.
- `llms.txt` no longer carries calculator boilerplate.

**Still open** (ROADMAP "Known gaps"):

- token floors for media in the hold estimate;
- the one-hour cache-write rate, long-context price tiers and web-search fees;
- holds that are lost on a restart.

### ventures/ticket-resale-profit-calculator (correctness 2, claims 2)

The reviewer is a full-time ticket broker. The pricing maths is right. Payout, break-even, the list price for a target profit and expected profit when a listing may not sell all match by hand, and so do the sales-log totals on the example file.

**The worst defect (high, input handling):** the page said thousands separators in the sales log are ignored. In fact an unquoted `$1,200.00` split the row at its comma, shifted every column after it, and the row was still accepted: "1 sales netted $198 on $1 paid (19800% ROI)".

**Fixed in this PR:**

- A row wider than its columns is now skipped and counted, not misread, and the note tells users to quote amounts.
- New tests pin break-even with per-ticket fees, the salvage value of unsold tickets, and the rule that a sale is a loss when the payout (not the gross) is below cost. Each of those seeded bugs had survived.
- The fee presets no longer say "as last checked", since nothing in the tree dates them.

**Still open** (README "Known gaps"):

- column headers are matched by prefix, so a `Purchase Date` column takes the cost slot;
- the cost box does not say whether the fees paid when buying belong in it;
- a blank fee box is read as 0%.

### research/simdesign-fwdcheck (verification 1, correctness 2, claims 2)

The reviewer is a structural engineer who checks finite-element (FE) results before signing off a design. The beam-theory stress and the mass match by hand for all four designs. The FE tip deflections fall 3 to 9% below a hand L-frame estimate, and the buckling factors 3 to 11% below a lateral-torsional hand estimate, both in the expected direction. The headline that buckling never binds under the forward load stands.

**The worst defect (high, domain rule):** the pass/fail stress was the peak at a sharp inner corner, where the true elastic stress is infinite. The auditor ran a third mesh on the 1.5 mm design, and the peak kept climbing: 36.7, 54.7, then 80.2 MPa. The coarse-mesh "pass" for the 2.0 mm design came from averaging stress over each element, which reads the ordinary bending stress low (30.2 MPa at mid-arm against 57.3 from beam theory). The README called that design "marginal". On the nominal stress it fails on every mesh, at 1.63 times the limit. No test pinned the shear term of the stress formula, the sign of the load, the clamp-zone exclusion or the deflection: all four seeded bugs passed.

**Fixed in this PR:**

- The README, the research index and the homepage summary now base the verdicts on the nominal stress and call the corner peak unconverged.
- New tests pin pure-shear von Mises (√3·τ) and the table's four nominal stresses.

**Still open** (README "Known gaps"): a filleted corner on an unstructured mesh, and tests of the forward buckling factor and the deflection.

### research/categorical-scores (verification 2, fitness 2, domain 2)

The reviewer is a decision theorist who works on proper scoring rules. This is the closest to the bar. An independent script, sharing no code with the project, matches all three regret formulas to 1e-15. A grid search over the simplex hits the worst-case formulas exactly. The √K ratio holds at K = 2, 4 and 9, and the experiments reproduce `results.txt` byte for byte.

**The worst defects (medium):**

- **No references.** The paper cited no prior work for results that are textbook: Savage 1971 and Gneiting and Raftery 2007 for regret as a Bregman divergence, Bickel 2007 for log against quadratic against spherical.
- **A floor-dependent headline.** The headline "0.15 for log" is not a property of the score. It is 0.29 at a floor of 1e-15 and infinite at 0.
- **Untested zero handling.** Three seeded bugs in how the log score treats zero probabilities passed the tests.

**Fixed in this PR:**

- A prior-work section with seven references.
- The floor dependence and the Brier closed form ρ²K/(K−1) are now stated.
- The spherical range is corrected from 1.75–2.2 to 1.39–2.24, as the paper's own E2 table shows.
- The stated reason for the √K gap is replaced with the actual one: the 1/‖p‖ factor in the curvature.
- Two zero-mass tests, which now fail all three surviving mutants.

## A trap in the audit tool, fixed

While checking the ticket-resale fixes, my first re-runs of the mutants said every one survived, even though the new tests clearly covered them. The cause was a mistyped command: it passed a test glob to node with its shell quotes still in it, so node found no tests and exited 0. The tool counted that empty pass as a green baseline, and then as a survival for every mutant. `platform/ci/quality_mutate.py` now refuses a baseline that ran no tests (node's `# tests 0`, unittest's `Ran 0 tests`), and it has a test for that. The auditors' own rows ran real suites. They show catches in the same runs, and I checked one survival (the salvage-value bug passes the original 31 tests).

## What changed since round 61

The share at the bar is the same: 0 of 4 again. Verification binds in all four subjects, for the fourth round running. The fixes in this PR make 8 of this round's 12 surviving mutants fail. A later round will re-audit these subjects rather than raise any score now. Two of the four subjects were wrong where it mattered, not only at an edge: the spend cap could be walked past with an ordinary document input, and the FE study's pass/fail rested on a number that keeps growing as the mesh is refined. The products' common case is right, and the research reproduces its numbers. Both kinds of project still state their results more firmly than their evidence supports.
