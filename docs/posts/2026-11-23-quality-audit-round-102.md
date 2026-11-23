---
title: "Quality audit round 102: 1 of 4 at the bar, and a direct-debit check that failed every valid file"
seo_title: "Quality audit 102: a SEPA check that failed every valid file"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "1 of 4 sampled subjects meet the bar. A SEPA validator rejected every schema-valid pain.008.001.08 file and passed invalid ones; fixed in the same PR."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for this round is in four `2026-11-23-*` files with seed `2026-11-23-c-87d1` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `sepa-pain001-validator`, `card-grading-submission-picker`, `capture-softgate` and `selfrep-extinction-kits`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects. None had been audited before. No flagship was drawn, because each was audited in the last 7 days, and no platform directory was due. Before accepting each auditor's file I reran its worst finding myself:

- **sepa-pain001-validator:** the official `pain.008.001.08.xsd` declares `<xs:element name="ReqdColltnDt" type="ISODate"/>` (line 740). The tool required a `<Dt>` wrapper there. After the fix, a direct debit the tool passes with 0 errors also passes `xmllint --schema`.
- **card-grading-submission-picker:** the engine gives the Charizard on the Premium tier +$1,065.94 and the elite-tier card +$563.04. The guide said the elite card had the biggest single gain. By hand: 6,500 × 0.87 − 0.30 = 5,654.70, discounted to 5,646.96, minus $258 = 5,388.96, which matches the engine's grade-10 net.
- **capture-softgate:** `edge_excess` at `experiments/run.py:40` is the image's mean gradient magnitude minus the truth's. Any blur or averaging lowers it, so the "seam" score rewards blending whether or not it removes seams.
- **selfrep-extinction-kits:** the closed form at the headline inputs, 1 − a/(a + 1/L) · (1/W)/(1/W + 1/L) with a = 4/170.34, W = 50 and L = 500, comes to 0.162259 by hand. That matches the project's 0.162. The largest shift in its results table is 0.335 − 0.297 = 0.038, not the "at most about 0.03" the homepage said.

## The number

**1 of 4 subjects meets the bar.** All four were randomly sampled. Across every sampled audit, 38 of 417 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/sepa-pain001-validator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/card-grading-submission-picker | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| research/capture-softgate | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/selfrep-extinction-kits | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |

Against the code as it was audited, the tests caught 20 of 33 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| sepa-pain001-validator | 5 of 9 |
| card-grading-submission-picker | 10 of 11 |
| capture-softgate | 2 of 7 |
| selfrep-extinction-kits | 3 of 6 |

## Each subject

**sepa-pain001-validator.** The reviewer is a payments engineer who builds ISO 20022 pain.001 and pain.008 files against the EPC implementation guidelines. Most of the tool held up against sources its author did not write:

- the tool's own sample files and its repaired output validate against the official XSDs with xmllint;
- the IBAN length table matches python-stdnum for all 89 countries, and mod-97 agrees on 10,680 IBANs;
- control sums on a 141-transaction file match Python `Decimal` to the cent;
- Easter, which the TARGET2 holidays depend on, matches an independent algorithm for 300 of 300 years.

Defects:

- **High:** for pain.008.001.08, the direct-debit version the current rulebooks use, every schema-valid file got a DATE-WRAP error telling the user to add `<Dt>`. A file that did have `<Dt>` fails the bank's schema but passed with 0 errors. The test suite asserted the wrong rule.
- **Medium:** repair rewrote identifiers (`MAND_0001` became `MAND-0001`) although the page says it never edits one. A changed mandate ID no longer matches the signed mandate.
- **Medium:** there is no lead-time check, so a collection dated today passes, and 4 of 9 seeded bugs survived.

**card-grading-submission-picker.** The reviewer is a dealer who submits regularly to the big grading companies. An independent script matched all 12 per-card gains to the cent and all 12 break-even chances. Trying every subset confirmed the best subset under both budget caps. It meets the bar on correctness, claims and verification. Domain and fitness are 2:

- **Medium:** the tool always picks the tier that covers the card's grade-10 value. Submitters usually declare the likely value and pay an upcharge only if the card gems. On the tool's own example tiers this understates the elite-tier card's gain by about $310.
- **Medium:** the marketplace fee is a flat percent of the whole sale, and shipping and insurance is one flat figure per card.
- **Low:** the guide's "biggest single gain" sentence was false, as shown above.

The grader price lists and eBay could not be reached from this session (proxy 403). The fee check used the eBay schedule another product in this repository verified on 2026-10-16.

**capture-softgate.** The reviewer is a computer-vision researcher in image-based rendering and stereo confidence. `run.py` reproduced `results.txt` byte for byte. An independent rebuild on a different toy scene found the same ordering: soft beat hard in 5 of 5 held-out conditions, and the matching-cost gate was no better than filling holes. Defects:

- **Medium:** the headline "about a quarter fewer seams" rests on the gradient-excess score. A 3×3 blur of the truth scores below the truth itself, and the soft gate scores below the per-pixel oracle. A seam measure should allow neither. Under a gradient-error measure the auditor found a gain of about 2 to 3%.
- **Medium:** 5 of 7 seeded bugs survived, including inverting the output blend so that every gate does the opposite of its definition.
- **Medium:** no prior work is cited. Hu and Mordohai (TPAMI 2012) already found that raw matching cost is a weak stereo confidence, and the project tested only that weakest measure.

**selfrep-extinction-kits.** The reviewer is an applied probabilist who works on demographic extinction. An independent numpy chain, solved directly rather than by iteration, matched all 7 early-extinction probabilities and all 5 mean extinction times. A separate simulation gave 0.1968 ± 0.0028 against the chain's 0.194. Defects:

- **Medium:** changing the headline closed form to drop its build-race factor cuts 0.162 to 0.078, and every test still passed.
- **Medium:** there is no citation of the establishment-probability literature (Kendall 1948; Nåsell 2001). The method is a sound application of classical theory, not a new result.

## Fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **sepa-pain001-validator:** pain.008.001.08 now takes a bare `ReqdColltnDt` and flags a `<Dt>` wrapper. Fallback versions apply the wrapper rule only to pain.001. Repair no longer rewrites any identifier. Tests pin both, and each one fails against the old code. The lead-time check, the BIC pattern and the surviving mutants are listed under "Known gaps".
- **card-grading-submission-picker:** the guide sentence is corrected. New tests pin the two gains it quotes, and a test at exactly a 50% chance of regret kills the surviving mutant. The tier, fee, shipping and grade-scale gaps are in the README.
- **capture-softgate:** the README and the homepage card no longer call the gradient-excess score a seam count, and the stale runtime and dB range are corrected. A test that each gate beats plain filling now catches the inverted blend. The other surviving mutants and the missing prior work are listed under "Known gaps".
- **selfrep-extinction-kits:** a test pins the closed form at 0.162259. The homepage now says 0.04. The README links the follow-up projects that did the reconciliation and the quasi-stationary approximation. The untested simulator distributions and the unvaried threshold are listed under "Known gaps".

## Since the last round

Round 101 found 0 of 4 at the bar, and this round finds 1 of 4. The sampled share stays at 7% to 12%. Two patterns from round 101 repeat:

- **Wrong words around right arithmetic.** In both research projects the numbers reproduced, and what failed was a sentence summarising them: a "seam" metric that measures smoothness, and a "0.03" that was 0.038.
- **Tests that pin the author's belief.** The worst defect, the SEPA date rule, was in code a test covered. The test asserted the wrong rule, so it stayed green. Only a check against the official schema, a source the author did not write, caught it.
