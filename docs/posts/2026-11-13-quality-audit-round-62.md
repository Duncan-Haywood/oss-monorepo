---
title: "Quality audit round 62: 0 of 4 at the bar, and a spend cap that let n=4 calls spend 2.4 times the limit"
seo_title: "Quality audit 62: LLM spend cap, ticket resale log, L-bracket stress"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. An LLM spend guard held the cost of one answer when OpenAI billed for four; three calls spent $0.12 under a $0.05 cap."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-h` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 61 had already used seeds `2026-11-13` to `-g`, so this one took `-h`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 262 meet it (Wilson 95% interval 8% to 16%). All four are finished (completeness 3). All four miss on claims, and all four on verification.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/llm-spend-guard | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/ticket-resale-profit-calculator | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/simdesign-fwdcheck | 2 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/categorical-scores | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| llm-spend-guard | 3 of 5 | 5 of 8 |
| ticket-resale-profit-calculator | 1 of 5 | 4 of 7 |
| simdesign-fwdcheck | 1 of 5 | 4 of 5 |
| categorical-scores | 2 of 4 | 5 of 6 |

The tests caught 7 of 19 seeded bugs (round 61: 6 of 16). That makes three rounds in a row where every subject let at least one seeded bug through.

I re-ran one check from each audit myself:

- **llm-spend-guard:** the auditor's script showed three `n=4` calls admitted and $0.12015 spent under the $0.05 cap.
- **categorical-scores:** an independent 60-digit finite-difference script reproduced the paper's E2 table exactly.
- **simdesign-fwdcheck:** I worked the beam stress by hand: 4.2 + 158.6 = 162.8 MPa.
- **ticket-resale-profit-calculator:** the "Net Profit" case failed on the old parser and passes on the fixed one.

One auditor claim did not survive the check. The suggested test for llm-spend-guard's input estimate expected 102 tokens for a 300-character string. The code counts a string's raw bytes, so the right answer is 100. The test went in with 100.

## Verdicts and worst defects

### ventures/llm-spend-guard (correctness 2, claims 2)

The reviewer is a platform engineer running production OpenAI and Anthropic traffic. Their first question is whether a "hard" cap can be overshot. Much of it holds:

- Twenty parallel calls under a $0.10 cap gave 6 admitted, 14 refused with HTTP 402, and $0.090 spent.
- Cache-read and 5-minute cache-write pricing, an OpenAI reply with cached tokens, and an Anthropic stream all settled to the cent of a hand figure.

**The worst defect (high, logic error):** OpenAI's `n` parameter asks for n answers and is billed for all of them. The guard held the cost of one, so three `n=4` calls under a $0.05 cap ran the budget to $0.12. It had two more holes:

- With only `gpt-5` priced, `gpt-5-pro` was admitted at `gpt-5`'s price. That broke the README's "a model with no configured price is refused".
- A stream that closed cleanly without its end marker was charged from partial usage ($0.006) instead of its hold ($0.060).

**Fixed in this PR:**

- `n > 1` is refused before the call leaves the proxy.
- Only dated snapshots and `-latest` inherit a price by prefix.
- A stream without `message_stop` or `[DONE]` is charged at its hold.

New tests cover each case and one of the two seeded bugs that had survived.

**Still open** (ROADMAP "Known gaps"):

- Anthropic's 1-hour cache writes settle at the 5-minute rate: 100K tokens at $0.377 against $0.602.
- Long-context price tiers are not modelled.
- A call in flight during a restart keeps its reserve.

### ventures/ticket-resale-profit-calculator (verification 1, correctness 2)

The reviewer is a full-time ticket broker and their accountant. The pricing maths is right: break-even, target price, expected profit with salvage, and the sale chance needed to break even all matched hand figures to the cent, and so did the page's 12-sale example.

**The worst defect (high, input handling):** the sales-log parser matched columns by their first letters and took the first match.

- A "Net Profit" column placed before "Payout" was read as the payout, turning a $70 gain into a $130 loss.
- "Cost per ticket" was read as the cost of the whole lot.
- "Buyer" was read as a cost and "Sold On" as a sale price, which made every row unreadable.
- A blank fees cell became $0.

**Fixed in this PR:**

- Each header is claimed by one field.
- Profit and ROI columns are never read as money in.
- A per-ticket cost is multiplied by quantity.
- A blank fees cell with no payout skips the row.

Hand-computed tests now kill two of the four mutants that survived.

**Still open:** the 10% and 15% fee presets have no source or date.

### research/simdesign-fwdcheck (fitness 1, verification 1)

This is a finite-element check of a sheet-steel L-bracket, so the reviewer is a senior FE analyst. `run.py` regenerates every number in seven and a half minutes. The beam stress, mass and a Castigliano deflection match independent hand calculations.

**The worst defect (high, domain rule):** the "FE peak stress" columns are element-centroid values. With 2 and 4 elements across the section, those centroids sit inside the outer fibre, so they see only 50% and 75% of the bending stress. At mid-arm, far from any corner, the coarse mesh reads 83.5 MPa against beam theory's 162.8. That made three README claims wrong:

- that the 2.0 mm design "passes on the coarse mesh";
- that the 1.5x rise with refinement is about the corner (it is 0.75 / 0.5);
- that the peaks "overstate what a filleted part sees", when every one is below the stress with no concentration at all.

The headline (only the 1.5 mm design survives) stands, because the beam stress alone decides it.

**Fixed in this PR:** the README and the research index. **Still open** (README "Known gaps"):

- The declared limits are never applied in code.
- 4 of 5 seeded bugs survived the tests.
- No outside prior work is cited.

### research/categorical-scores (claims 2, verification 2)

The reviewer works on proper scoring rules. This is the round's strongest subject:

- `results.txt` and the figure reproduce byte for byte.
- No report beat the truth in 60 random properness trials.
- The worst-case-regret formulas equal a brute-force maximum.

**The worst defects (medium):**

- §4 said spherical stays at 1.75–2.2, while the experiment gives 1.386 to 2.236.
- A curvature check described as "to 0.1%" runs at 0.5%.
- The log-loss figure for zeroing a rare class (0.151) depends on `run.py`'s 1e-9 floor. It is 0.082 at 1e-6 and infinite at a true zero.
- There was no references section, though Bickel (2007) compared the same three scores.

**Fixed in this PR:** the ranges, the floor caveat, a references section, and a test for the zero-probability branches. That test kills both mutants that had survived.

## What changed since round 61

Nothing re-audited, so there is no before-and-after this round. The pattern from rounds 59 to 61 holds: the core arithmetic is right, and the claims around it are not. In three of the four subjects the worst defect sits at the edge between the maths and what it is told about the world:

- what OpenAI bills for;
- what a spreadsheet column is called;
- where a finite element samples its stress.

The authors' own tests never reached those edges.
