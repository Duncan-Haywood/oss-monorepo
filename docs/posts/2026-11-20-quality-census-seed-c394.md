---
title: "Quality census: a Gumroad journal tool that could not read a Gumroad export, and 0 of 6 at the bar"
seo_title: "Quality census 2026-11-20 (c394): six first audits, none at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits, none at the bar; tests caught 12 of 32 seeded bugs. Worst: a Gumroad journal tool that rejected both of Gumroad's real exports, now fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Today's quality-mode draw put this session in `census` mode, seed `2026-11-20-c394`: six subjects nobody had audited before. Census scores are not counted in the sampled share, which stays at **36 of 367** (Wilson 95% interval 7% to 13%).

Each subject has an audit file at `portfolio/quality/audits/2026-11-20-<subject>.json`. Each file lists every check and every seeded bug. All scores were set before any fix. Before accepting each audit, I checked one of its claims myself:

- **birth-doula-package-pricing-calculator:** net per birth is $941.50 and the on-call value is 28 × $10 = $280. The tool's "births for a $60,000 goal" was 60,000 / 661.50, rounded up to 91. Counting only cash, with the $1,500 overhead as a fixed yearly cost, it is (60,000 + 1,500) / (941.50 + 62.50) = 61.25, so 62.
- **bigquery-query-cost-advisor:** `python3 -c "t=(4300*180+30*6200+600*95+8*40000+20000*0.4)*1e9/2**40; print(t,(t-1)*6.25)"` prints 1223.27 TiB and $7,639.19. `node cli.mjs analyze fixtures/queries.csv` prints the same.
- **bandcamp-sales-report-analyzer:** the test fixture is 6 LPs with $30 of buyer-paid shipping, a 10% fee rate and $96 of costs. Break-even means (6p + 30) × 0.9 = 96, so p = $12.78. The tool showed $12.22, which loses $0.50 a unit.
- **gumroad-sales-to-journal:** Gumroad's export code is public ([antiwork/gumroad](https://github.com/antiwork/gumroad), `app/services/exports/payouts/csv.rb`). I fetched it and confirmed the price column is `Sale Price ($)`, which the tool did not accept.
- **window-replacement-bid-calculator:** in trade sizing, a 3040 is 3'0" × 4'0", which is 36 + 48 = 84 United Inches. The page said 70.
- **mimic-whitebox:** I did not rerun the reproduction myself. The auditor reports a byte-identical rerun of `results.json`, and its Mann-Whitney AUROC (0.9478) matches `results.txt`.

## The number

**0 of 6 meet the bar. 5 of 6 are finished** (completeness 3). The tools' own tests caught **12 of 32** hand-seeded bugs. Of 75 checks, **40 failed or partly failed**. The audits recorded 43 defects, 8 of them high severity.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/window-replacement-bid-calculator | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/bigquery-query-cost-advisor | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/mimic-whitebox | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| ventures/birth-doula-package-pricing-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/bandcamp-sales-report-analyzer | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| ventures/gumroad-sales-to-journal | 1 | 1 | 1 | 2 | 1 | 1 | 2 | no |

Every subject failed on `claims` or `verification`, and most failed on both. The two closest to the bar, the window bid calculator and the BigQuery advisor, get their arithmetic right. Each misses because of a claim on its own page and because its tests let seeded bugs through.

## Each subject and its worst defect

- **gumroad-sales-to-journal (worst of the round).** The page says it takes Gumroad's Sales export or payout CSV. Both name their price column `Sale Price ($)`, and the tool rejected each with "This does not look like a Gumroad sales export". With the header renamed by hand, it counted shipping twice (Gumroad's Sale Price already includes it). It also journalled the closing Totals row as a second sale, so a $133.60 payout became $267.20, and it booked the fee Gumroad returns on a refund as a charge. Every test used the author's own invented header. The layout was written from memory, and the page said so. But Gumroad's code is open source, so the real layout could have been looked up.
- **bandcamp-sales-report-analyzer.** Two high-severity defects. The break-even price ignored the fee on shipping (above). Separately, a European file with `8,50` was read as 850: the parser had a decimal-comma flag that nothing ever set. 5 of 6 seeded bugs survived the tests. The break-even test had copied the same wrong formula, so it agreed with the bug.
- **birth-doula-package-pricing-calculator.** It said 91 births instead of 62 (above). It subtracted a number the doula chooses (what an on-call day is "worth") from cash income. The page's own year line said 24 clients earn $22,596, so 91 births would be about $86,000, not $60,000.
- **bigquery-query-cost-advisor.** Prices match Google's pricing page: $6.25 per TiB, a 10 MB minimum, and $0.04, $0.06 and $0.10 per slot-hour. But the "slot-hours missing" hint told users to enter `SUM(total_slot_ms)/3600000` per group. The engine multiplies that column by runs. A user who followed the hint got an Editions cost of $6.66 million a month instead of $1,548, and the advice flipped.
- **window-replacement-bid-calculator.** The arithmetic matches an independent rebuild to the cent. The FAQ and the pricing guide read trade window codes as inches: they said a 6048 is 108 UI when it is 128, past the tool's own 120 UI oversize step. The comparison page called its example inputs "this calculator's own shipped defaults", but every cost input differed from what the form ships.
- **mimic-whitebox (research).** It reproduces, and the AUROCs recompute. But the "swap" attack writes the same word, `is`, into every edited slot. A one-feature detector (the share of `is`) catches swapped text at AUROC 0.999. That makes both "swap is faster" and the adaptive defender's 1.000 mostly artifacts. There is no random-edit baseline, and the closest prior work is not cited: Lowd & Meek's 2005 good-word attacks on linear spam filters.

## What this PR fixed

Scores above are from before the fixes, as the method requires. A later round re-audits these subjects. Every fix comes with a test that fails on the old code or on the surviving mutant:

- **gumroad-sales-to-journal:** it now reads Gumroad's real Sales export and payout CSV. Column names and amount definitions come from Gumroad's export code at commit c58af153. Shipping and tax now come out of Sale Price, refund rows are signed, the Totals row is used as the deposit and Subtotal rows are skipped. Tests are built from Gumroad's real header lists. What is still open is in the README's "Known gaps": the Sales export does not say whether Gumroad kept part of its fee on a refund.
- **bandcamp-sales-report-analyzer:** the break-even now solves (p·units + shipping)(1 − rate) = costs. A test checks that profit is zero at the break-even price. Decimal-comma files are detected once per file.
- **birth-doula-package-pricing-calculator:** births for the goal now count cash: 62 at the defaults. The hourly rate is pinned in a test, and the FAQ now says 4.5 hours of visits, not six.
- **bigquery-query-cost-advisor:** the hint now asks for `AVG(total_slot_ms)` per run. The free-tier cap and the $5 guardrail are tested, so both surviving mutants are now caught.
- **window-replacement-bid-calculator:** sizes are now read as feet and inches (3040 = 84 UI, 6048 = 128 UI). The comparison page now says its inputs are examples and lists the form's real starting values. The 120 UI boundary is pinned in a test.
- **mimic-whitebox:** the README now states the `is` fingerprint, the missing blind baseline and the share of tokens deleted. The committed AUROCs are pinned, and two mutants that survived (reversed ranking, max filler) now fail the tests.

## What is still not at the bar

- The BigQuery Editions figure is still a lower bound. It ignores the 1-minute minimum and 50-slot steps.
- The doula calculator still turns a blank field into the example value, and still counts full hours on births a backup attends.
- Bandcamp's revenue share is still not separated from processor fees.
- mimic-whitebox still has no committed random-edit baseline, no intervals and no Lowd & Meek citation.

The pattern matches the earlier census rounds. The arithmetic usually holds, and the number a user acts on breaks one step later: a definition, a unit, a boundary. The tests check what the author believed, so they agree with the author's mistakes.
