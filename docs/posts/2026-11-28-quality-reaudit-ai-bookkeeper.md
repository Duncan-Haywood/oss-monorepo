---
title: "Re-audit: AI Bookkeeper's tax worksheets check out, and a stale table finally gets a test"
seo_title: "Testing that a README's benchmark numbers still reproduce"
date: 2026-11-28
tags: [quality-audit, evaluation, bookkeeping, ai-bookkeeper]
description: "AI Bookkeeper re-audit: the marked fixes hold and the new tax checks pass. A table stale for four audits is now generated and tested."
---

[AI Bookkeeper](https://marisstella.app/ai-bookkeeper/) turns bank and card
statements into double-entry books and year-end tax worksheets for sole
proprietors. The [2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-ai-bookkeeper.json)
found eight defects, and PR #17639 marked three of them fixed. This re-audit
([file](../../portfolio/quality/audits/2026-11-28-ai-bookkeeper-reaudit.json))
went back over all eight against `main` as it is today.

**Verdict: the tax engine is right, but the claims still missed the bar before
this round's fix.** It scored 3 on six dimensions and 2 on claims, so it does
not meet the bar yet. The fix in this PR should let the next re-audit raise
claims.

## What the earlier fix closed

| prior defect | now |
|---|---|
| $400 Schedule SE threshold not covered by any test | closed: the `<=` mutant now fails the suite |
| page's "Not modelled" list named features the page offers | closed |
| Form 8959 a cent low from float rounding | closed: 277.88 at $250,000 profit |
| README learning-curve table stale | **still open on arrival**, closed by this PR |
| two-row day-first file read month-first, silently | partly: four-row files now get a note |
| payment plan with no `--as-of` lists past installments as due | open |
| groceries suggested to Meals with no personal-spend caution | open |
| probe files and a committed wheel | partly: wheel gone |

## New recomputations, all matching

- Schedule SE at net earnings of exactly $400.00: $61.20 of tax. At $399.99: none.
- SE with $150,000 of W-2 wages and $100,000 profit (2026): the Social Security part
  stops at the $34,500 left under the $184,500 base, so $4,278.00 + $2,678.15.
- 2026 head-of-household tax on $80,000: $10,501. 2025 single on $60,000: $8,114.
- Form 8959 at $300,000 profit: $693.45.
- MACRS 3-year property on $9,000 (Pub 946 Table A-1): 2,999.70 / 4,000.50 / 1,332.90 / 666.90.

The suite has 2,905 tests and they pass. Both seeded bugs were caught.

## The defect that kept coming back

Four audits running (11-07, 11-09, 11-19, 11-28) found that the README's
learning-curve table no longer matched the benchmark it cites. This round also
found that the page and `llms.txt` quoted the same stale months 4-12 figures:
1,300 of 2,164 lines posted alone, where a fresh `node eval/benchmark.mjs
--seeds 5` prints 1,296 of 2,161. Review suggestions were understated too, at
542 of 642 against 594 of 688.

The cause was a test that checked a copy. `page.test.mjs` made sure the page
quoted the README's numbers, so the two always agreed, but neither was ever
compared with the benchmark. Every categoriser change since 11-07 moved the
benchmark, and no test noticed. Each audit wrote the defect down again, and no
fix PR picked it up.

The fix follows the repository's rule that routine work goes to software:
`eval/benchmark.mjs --readme` now writes the table and its summary between
markers in the README. The new `benchmark-readme.test.mjs` runs the benchmark
(about one second) and fails if the README, the page or `llms.txt` no longer
match the run. A wrong headline number can't be merged now without a red test.

## What is still not at the bar

Three low-severity defects remain, each a short fix for a later session:

- A two-row file with ambiguous dates is still read month-first with no note.
- A payment plan with no `--as-of` treats a November run as if it were January.
- Grocery chains are still suggested to Meals with no caution that they are
  usually personal spending.

The data the benchmark runs on is synthetic, and the README says so.
