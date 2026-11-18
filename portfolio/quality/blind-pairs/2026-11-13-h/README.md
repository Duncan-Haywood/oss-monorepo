# Blind pair: round 62, seed 2026-11-13-h

On 2026-11-13, two scheduled quality sessions drew the same seed (`2026-11-13-h`) and the same four subjects within minutes of each other. Each opened its claim PR before the other's was visible to `quality_audit.py sample`, and neither read the other's files:

- Session `01E5sJKmdxReTmBfTPwYQ9qE` landed first, in PR #15416. Its files are the canonical audits in [`../../audits/`](../../audits/).
- Session `01E5sJKnU29tE7kf2913XJu1` landed second, in PR #15417. Its files are kept here.

As in [`../2026-11-13-e/`](../2026-11-13-e/README.md), this directory is outside `audits/` so `quality_audit.py summary` does not count one round's subjects twice.

## Scores (canonical / this pair)

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/llm-spend-guard | 2 / 2 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 2 | 2 / 2 | 2 / 2 | no / no |
| ventures/ticket-resale-profit-calculator | 2 / 2 | 3 / 3 | 1 / 2 | 2 / 3 | 2 / 2 | 2 / 2 | 2 / 3 | no / no |
| research/simdesign-fwdcheck | 2 / 2 | 3 / 3 | 1 / 1 | 2 / 2 | 2 / 2 | 1 / 2 | 2 / 2 | no / no |
| research/categorical-scores | 3 / 3 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 3 | 2 / 2 | 2 / 2 | no / no |

**Agreement:**

- 23 of 28 dimension scores are identical (82%), and all 28 are within one.
- The bar verdict agrees on 4 of 4 subjects.
- All 5 disagreements go the same way, but the opposite way to round 59: this time the second audit scored one point *higher* each time. Pooled over both blind pairs, there are 12 disagreements, 7 lower and 5 higher. So there is no sign that whichever audit lands second runs consistently harsher or more lenient.
- Pooled over both pairs: 44 of 56 identical (79%, Wilson 95% 66% to 87%), 56 of 56 within one, 8 of 8 bar verdicts.

## Findings

**High-severity defects.** The canonical audit filed 5 and this pair filed 6.

Both audits found these, at high severity in both:

- llm-spend-guard ignores OpenAI's `n`;
- simdesign-fwdcheck's stress verdict rests on a sampled FE value that cannot carry it;
- simdesign-fwdcheck's headline overclaims the 2.0 mm verdict.

Both found the ticket-resale header-prefix mapping, but only the canonical audit rated it high.

Each audit found a high-severity defect the other missed:

- **Canonical audit only:**
  - llm-spend-guard prices `gpt-5-pro` with `gpt-5`'s price, because model names match by longest prefix.
- **This pair only:**
  - llm-spend-guard's hold estimate cannot see an image or document sent by URL or file id. 20 concurrent calls with a PDF by URL spent $15.31 against a $1 budget.
  - llm-spend-guard's "never promised twice" guarantee had no stated limits.
  - ticket-resale reads an unquoted `$1,200.00` as cost $1 and reports a 19,800% ROI.

**Medium- and low-severity defects found by one audit only.**

- **Canonical audit only:**
  - llm-spend-guard: a stream that closes cleanly without its end marker was settled from partial usage.
  - ticket-resale: a blank fees cell becomes $0 fees.
  - ticket-resale: `Sold On` and `Buyer` columns hijack the sale and cost fields.
  - simdesign-fwdcheck: the declared limits are never applied in code.
  - simdesign-fwdcheck: `results.txt` carries a wall-clock column.
  - simdesign-fwdcheck: no outside prior work is cited.
  - categorical-scores: the payment-range normalisation is not justified.
- **This pair only:**
  - ticket-resale: the cost box does not say whether buy-side fees belong in it.
  - ticket-resale: the page reads a blank number box as 0.
  - simdesign-fwdcheck: `static()` assembles an unused matrix.
  - categorical-scores: the stated reason for the √K gap is wrong. The actual cause is the 1/‖p‖ factor in the spherical curvature.

**Both audits explain the FE stress the same way.** A centroid two elements across the width sits w/4 inside the outer fibre, so it reads about half the bending stress. The canonical audit measured 83.5 MPa at mid-arm on the 2.0 mm design (beam theory: 4.2 + 0.5 × 158.6). This pair measured 30.2 MPa on the 1.5 mm design (beam theory: 3.0 + 0.5 × 54.3).

**They differ on the corner peak at eight elements across the width:** 74.1 MPa (canonical) and 80.2 MPa (this pair, mesh (8, 72, 56, 1)). The other mesh counts were not recorded the same way, so this difference is unresolved.

**Seeded bugs:**

| subject | canonical: caught | this pair: caught |
|---|---|---|
| llm-spend-guard | 3 of 5 | 6 of 8 |
| ticket-resale-profit-calculator | 1 of 5 | 2 of 5 |
| simdesign-fwdcheck | 1 of 5 | 0 of 4 |
| categorical-scores | 2 of 4 | 3 of 6 |

The mutants differ between the two audits, so these rates measure the mutants as much as the tests. Both audits seeded the same two bugs in the same place, and both saw them survive:

- in ticket-resale, the per-ticket fee dropped from break-even;
- in categorical-scores, `kl` returning 0 for a zero report.

## What landed from this pair

PR #15417 merged main and kept #15416's fixes:

- the `n` refusal;
- whole-name header matching;
- the snapshot-only prefix rule;
- the end-marker check;
- the FE wording.

It added the fixes for the defects only this pair found:

- **ticket-resale:** the unquoted-comma guard, plus tests for break-even with per-ticket fees, salvage value and the losing-sales filter;
- **llm-spend-guard:** a test that a stream the provider cuts off is charged its whole hold; the guarantee now states its text-only limit; the `VENTURE.yaml` hypothesis is marked `refuted`; the media gap is in the ROADMAP;
- **categorical-scores:** the √K cause, the Brier closed form ρ²K/(K−1), tests for zero report and zero truth mass, and one merged reference list;
- **simdesign-fwdcheck:** tests for pure-shear von Mises and the table's four nominal stresses.

## Reading

Two blind pairs now agree on about four in five dimension scores and on every bar verdict, so the headline share meeting the bar is not an artefact of who audits. The defect lists are another matter. In both pairs, each auditor found serious defects the other missed. This time that includes the most consequential finding of the round: the spend cap could be bypassed by sending a document by URL. One audit's "worst defect" is a sample, not a census. A union of two blind audits is the better estimate of what is wrong with a subject.
