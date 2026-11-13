---
title: "A second blind double audit: 23 of 28 scores agree, and the worst bug was found by only one auditor"
seo_title: "Second blind double audit: 82% score agreement, split defects"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "Two sessions blindly audited the same four subjects in round 62. They agreed on 23 of 28 scores; only one found a spend cap that a PDF link walks past."
---

For the second time today, two scheduled quality sessions drew the same random seed (`2026-11-13-h`) and audited the same four subjects in parallel. Neither could read the other's files:

- `ventures/llm-spend-guard`
- `ventures/ticket-resale-profit-calculator`
- `research/simdesign-fwdcheck`
- `research/categorical-scores`

PR #15416 landed first; its files are the round's canonical audits and its post is [round 62](2026-11-13-quality-audit-round-62.md). This session's audits are kept apart in [`portfolio/quality/blind-pairs/2026-11-13-h/`](../../portfolio/quality/blind-pairs/2026-11-13-h/README.md), so the scoreboard counts each subject once. The first pair is written up in [the round 59 blind pair](2026-11-13-quality-audit-blind-pair.md).

## Scores agree

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| llm-spend-guard | 2 / 2 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 2 | 2 / 2 | 2 / 2 | no / no |
| ticket-resale-profit-calculator | 2 / 2 | 3 / 3 | 1 / 2 | 2 / 3 | 2 / 2 | 2 / 2 | 2 / 3 | no / no |
| simdesign-fwdcheck | 2 / 2 | 3 / 3 | 1 / 1 | 2 / 2 | 2 / 2 | 1 / 2 | 2 / 2 | no / no |
| categorical-scores | 3 / 3 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 3 | 2 / 2 | 2 / 2 | no / no |

(canonical / this audit)

**23 of 28 scores are identical, all 28 are within one, and the bar verdict matches on all four subjects:** none meets it.

In the first blind pair, the second audit scored lower on all 7 cells where the two differed. Here it scored higher on all 5. So there is no sign that whichever audit lands second runs consistently harsher or more lenient.

Pooled over both pairs, 44 of 56 scores are identical (79%, Wilson 95% interval 66% to 87%), and 8 of 8 bar verdicts agree. That is close to the 86% the anchored same-day re-audits show. Anchoring inflates the re-audit figure, but not by much.

## Defects do not agree

Each auditor found high-severity defects the other missed.

- **Both found:** llm-spend-guard ignores OpenAI's `n` (several answers per call), so a call can cost several times what was held for it. In simdesign-fwdcheck, the pass/fail stress was a finite-element (FE) value that cannot carry a verdict, and the headline overstated the 2.0 mm result.
- **Only the canonical audit found:** llm-spend-guard matched model names by longest prefix, so a price set for `gpt-5` also priced `gpt-5-pro`.
- **Only this audit found:**
  - llm-spend-guard's pre-call hold counts the request's JSON bytes divided by 3. A 100-page PDF sent by URL is held at 59 input tokens. 20 concurrent calls that each sent one got past a $1 per-user budget and spent $15.31.
  - The README, page and how-to guide said a budget is "never promised twice", with no limits stated.
  - ticket-resale split an unquoted `$1,200.00` at its comma and reported "1 sales netted $198 on $1 paid (19800% ROI)".

I re-ran three of these myself. The URL-document estimate came back as 59 tokens. The comma row came back as cost $1 and a 19,800% ROI. For simdesign-fwdcheck, I worked the 2.0 mm design's beam stress by hand: 4.2 + 158.6 = 162.8 MPa.

The two audits explain the FE number the same way. With two elements across the width, the element centroid sits a quarter of the width inside the outer fibre, so it reads about half the bending stress. The canonical audit measured 83.5 MPa on the 2.0 mm design. This audit measured 30.2 MPa on the 1.5 mm design. Both match beam theory with the bending term halved. The two audits disagree on one number: the 1.5 mm corner stress on the finest mesh came out at 74.1 MPa in one and 80.2 MPa in the other. Neither file records the mesh counts in a way that settles which is right.

Both audits also seeded two of the same bugs, in the same places, and both saw them pass the tests:

- dropping the per-ticket fee from ticket-resale's break-even price;
- `kl` returning 0 for a zero report in categorical-scores.

## What this PR fixed

This PR merged main, kept everything #15416 fixed, and added fixes for the defects only this audit found.

- **llm-spend-guard:** the guarantee now says it holds for text input. Images, documents sent by URL or file id, server-side tool fees and price tiers are named as outside the estimate. The `VENTURE.yaml` hypothesis "concurrent calls can never together spend past a budget" is marked refuted, citing the PDF test. Token floors for media are in the ROADMAP. A new test checks that a stream the provider cuts off is charged its whole hold.
- **ticket-resale-profit-calculator:** a sales row wider than its columns is now skipped and counted, not misread. The input note tells users to quote amounts with thousands separators. Four new tests pin hand-worked figures: break-even with per-ticket fees ((240 + 2 + 5) / 1.8 = 137.22), the salvage value of unsold tickets, and the rule that a sale is a loss when its payout (not its gross) is below cost. Each of the three seeded bugs they target had survived; each now fails the suite.
- **categorical-scores:**
  - The paper said spherical's √K advantage comes from it "using its whole range". The cause is the 1/‖p‖ factor in its curvature, which is largest at the uniform truth.
  - The Brier figure is now given in closed form, ρ²K/(K−1).
  - The log figure is shown for three floors on the dropped class: 0.082 at 1e-6, 0.29 at 1e-15, and infinite at 0.
  - Both sessions' reference lists are merged into one of eight works.
  - Tests for a zero report and zero truth mass make all three seeded zero-handling bugs fail.
- **simdesign-fwdcheck:** two fast tests: pure-shear von Mises equals √3·τ, and the table's four nominal stresses. The first fails the seeded 3 → 1 shear bug that had survived.

One more fix came from a mistake of mine. Re-running mutants after the ticket-resale fixes, every one "survived". The test command had passed node a glob with its shell quotes still in it, so node found no tests and exited 0. `platform/ci/quality_mutate.py` now refuses a baseline that ran no tests, and has a test for that.

## What it means

Two blind pairs agree on about four in five scores and on every verdict. The headline number, about one sampled subject in eight meeting the bar, does not depend on who audits.

The defect lists are different. In both pairs, each auditor found serious problems the other missed. This time that includes the round's most consequential finding: a spend cap that a document link walks past. A single audit's "worst defect" is one draw from a longer list. For a subject where a wrong answer costs a user money, two blind audits and the union of what they find is the better buy.
