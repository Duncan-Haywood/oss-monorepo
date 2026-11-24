---
title: "Re-audit: the QIF checker's fix closed 4 of 7 defects, and all 7 had been counted closed"
seo_title: "Why a Quicken investment QIF shows false 'no amount' errors"
date: 2026-11-24
tags: [quality-audit, evaluation, testing, bookkeeping]
description: "A full Quicken export now passes the QIF checker clean, but share transfers in an investment account still raised false errors, and three of the seeded bugs the last audit named still passed every test."
---

The [QIF file check](https://marisstella.app/qif-file-check/) reads a Quicken Interchange Format
file, the plain-text export Quicken and many banks still produce, and reports why it would import
with the wrong month, twice, or not at all. It also writes a repaired file. The
[2026-11-13 audit](../../portfolio/quality/audits/2026-11-13-qif-file-check.json) found seven defects
and listed one fix PR. Because that audit marked no defect with the PR that fixed it, the quality
scoreboard counted all seven as fixed. Today's re-audit checked each one against the code as it
stands ([audit file](../../portfolio/quality/audits/2026-11-24-qif-file-check.json)).

**4 of 7 closed, 1 partly closed, 2 still open.**

| 2026-11-13 defect | on arrival today |
|---|---|
| high: a full Quicken export (account list, category list) reported 10 errors on one transaction | closed: 0 errors, 1 transaction |
| stray letters before an amount (`l2.50`) read as a currency code | closed: now "not readable" |
| investment records checked with bank rules | **open** |
| four seeded bugs passed every test | **partial**: 1 of 4 now caught |
| 02/30/2024 not flagged | closed |
| README's test command failed on Node 22 | closed |
| date rewrites not listed by line; boilerplate llms.txt | **open** |

The open investment defect is the one a bookkeeper would hit. In an investment account, a
`ShrsIn` record moves shares into the account and no cash, so QIF leaves out the `T` (amount) line.
The checker still demanded one, so every share transfer showed up as an error. It also warned
"No payee or memo" on every investment record, because the security name sits in `Y`, not `P`.

On arrival the tool still missed the bar: verification scored 2 (three of six seeded bugs passed
the 34 tests) and claims scored 2 (the page promises "every change is listed with the line it was
made on", but date rewrites came back as a bare count). Checked by hand, the bank, card and cash
results were right in four of four cases.

## What this PR changes

- Investment records now get investment rules. The action in `N` must be one of the QIF actions.
  Records need a security in `Y`, and a `T` line on every action that moves cash, but not on
  `ShrsIn`, `ShrsOut` or `StkSplit`. A buy and a sell of the same security on the same day are no
  longer flagged as a repeat.
- Every date the repair rewrites is listed by line ("2 dates on lines 2, 6 rewritten ...").
- `llms.txt` now describes a file checker, not "estimates from the numbers typed in".
- Seven new tests (41 in all). The three seeded bugs that had survived now fail the suite: splits
  compared in dimes instead of cents, the two-digit-year pivot moved, the payee dropped from the
  repeat key. So does a new bug in the investment rule.

Still not checked, and said so in the README: the arithmetic shares × price ± commission = amount.
Brokers round price and commission differently, and no tolerance has been chosen from real files.

The scores above are from before the fix. A later audit should re-score the tool, not this PR.

*This is a free MIT tool, not financial or professional advice; confirm against your importer's
own documentation.*
