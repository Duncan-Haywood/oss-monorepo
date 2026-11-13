# Blind pair: round 59, seed 2026-11-13-e

On 2026-11-13, two scheduled quality sessions drew the same seed (`2026-11-13-e`) and the same four subjects at about the same time. Neither session could see the other's files:

- Session `01AcxTtL5vUw9ZUSwEgZTuoQ` landed first, in PR #15368. Its files are the canonical audits in [`../../audits/`](../../audits/).
- Session `01E5sJKizGicZAi8AL2bAsdc` landed second, in PR #15369. Its files are kept here.

This directory is outside `audits/` on purpose. `quality_audit.py summary` must not count one round's subjects twice.

This is the programme's first measurement of agreement between auditors who did not read each other. The `metrics` "re-audit agreement" figure is an upper bound, because a later auditor can read the earlier file (`portfolio/quality/README.md`, "Metrics").

## Scores (canonical / this pair)

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/stripe-payout-to-journal | 3 / 2 | 3 / 3 | 2 / 2 | 3 / 2 | 2 / 2 | 3 / 2 | 3 / 3 | no / no |
| ventures/allergen-label-maker | 2 / 1 | 3 / 2 | 2 / 2 | 2 / 2 | 2 / 1 | 2 / 2 | 2 / 2 | no / no |
| research/cfar-family-twin | 3 / 3 | 3 / 3 | 2 / 2 | 3 / 3 | 3 / 3 | 2 / 2 | 2 / 2 | no / no |
| research/eda-gridorder | 3 / 3 | 3 / 3 | 2 / 1 | 3 / 3 | 2 / 2 | 2 / 2 | 2 / 2 | no / no |

**Agreement:**

- 21 of 28 dimension scores are identical (75%), and all 28 are within one.
- The bar verdict agrees on 4 of 4 subjects.
- All 7 disagreements go the same way: this pair scored one point lower each time.

For comparison, the anchored re-audit figure on 2026-11-13 (`quality_audit.py metrics --md`) was 36 of 42 identical (86%) for same-day pairs and 138 of 154 (90%) within two days.

## Findings

Both auditors found these:

- the cfar-family-twin power-sum target model;
- the stripe deposit box parsing `1,234.56` (or `1,262.00`) wrongly;
- the allergen label bolding from a shorter word list than the detector;
- `[none]` clearing named allergens;
- US pine nut;
- the US Contains line printing category names;
- the eda-gridorder missing prior work, and its "all 300" claim.

Only this pair found these:

- in the allergen tool, a second supplier tag is dropped (`stock [celery], paste [soya]` lost soya);
- the allergen tool misses sea bream, turbot, skate, john dory and lox;
- in the stripe tool, `payout_reversal` is booked to Adjustments rather than against clearing;
- in the stripe tool, Xero imports by account code;
- eda-gridorder's Halton headline is the best of 48 equivalent labellings (mean 0.854 against 0.926);
- the same deposit-box bug is in `sales-export-to-journal`.

Only the canonical audit found these:

- oatmeal, farina, cous cous, curds and lactalbumin are missed;
- the stripe sample's fee of 3.97 does not match 2.9% + 30c;
- `application_fee` is booked as a fee;
- eda-gridorder's "intervals just above random's" claim.

Seeded bugs:

| subject | canonical: caught | this pair: caught |
|---|---|---|
| stripe-payout-to-journal | 6 of 9 | 2 of 7 |
| allergen-label-maker | 3 of 4 | 3 of 6 |
| cfar-family-twin | 2 of 4 | 2 of 5 |
| eda-gridorder | 1 of 4 | 1 of 5 |

The mutants differ between the two audits, so these survival rates measure the mutants as much as the tests.

## Reading

With n = 28 the interval is wide. Still, the point estimate suggests that about a quarter of dimension scores move by one point depending on who audits, and that anchoring makes re-audits look more consistent than they are. Two auditors also found largely different defect lists, so neither list is complete. Running two blind auditors on a high-stakes subject, and taking the union of their defects, would surface more than one auditor does.
