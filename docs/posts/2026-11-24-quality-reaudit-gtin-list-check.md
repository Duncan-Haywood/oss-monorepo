---
title: "Re-audit: the barcode checker's fix closed both serious bugs, and its tests still missed the same three"
seo_title: "Is an 8-digit barcode a GTIN-8 or a UPC-E? Checking a product list"
date: 2026-11-24
tags: [quality-audit, evaluation, testing, ecommerce]
description: "A re-audit of GTIN List Check: the fabricated-barcode and GTIN-14 prefix bugs are gone, but four defects were open and three seeded bugs passed every test."
---

[GTIN List Check](https://marisstella.app/gtin-list-check/) reads the barcode column of a product
file (UPC, EAN, GTIN-14, ISBN) before a marketplace upload and says which codes are broken, which
it can repair, and which it cannot. The
[2026-11-12 audit](../../portfolio/quality/audits/2026-11-12-gtin-list-check.json) found nine
defects and listed one fix PR (#15073). Because that audit marked no defect with the PR that fixed
it, the scoreboard counted all nine as fixed. Today's re-audit checked each against the code as it
stood ([audit file](../../portfolio/quality/audits/2026-11-24-gtin-list-check.json)).

**3 of 9 closed, 2 partly closed, 4 still open.**

| 2026-11-12 defect | on arrival today |
|---|---|
| high: `1.0009E+11` "confirmed" and written back as a made-up 100090000000 | closed: any rounded digit makes the row unrecoverable |
| high: GTIN-14s of ordinary German and UK items flagged as coupon or in-store codes | closed: prefixes are read after the indicator digit |
| medium: an 8-digit code valid as both GTIN-8 and UPC-E kept silently | open |
| medium: seeded bugs survive the tests | partial: new tests for the two fixes, the same three mutants survive |
| low: 980 refund receipts and RCN-8 GTIN-8s not flagged | open |
| low: European `4,006381333931E+12` called "non-digit characters" | open |
| low: "proves" for a check digit that catches 9 in 10 errors | partial |
| low: repair drops empty rows and CRLF | open |
| low: README test command fails on Node 22 | closed |

The README's own "Known gaps" section listed the four open ones, so nothing was hidden from a
reader. The scoreboard was the thing that was wrong.

## What was still wrong

The verdict on arrival: **does not meet the bar**, because `verification` scores 2. The core
check-digit maths is exact (0 disagreements with an independent GS1 mod-10 over 100,000 random
codes, plus hand-worked and ISBN cases), and both high-severity outputs are gone. But four seeded
bugs went in through `platform/ci/quality_mutate.py`, and three passed all 41 tests: dropping the
`04` prefix rule, scrambling one UPC-E expansion pattern, and letting a scientific-notation value
that lost exactly one digit through. They are the same three that survived on 2026-11-12. The fix
PR wrote tests for the two bugs it fixed and nothing else, so the gap in the tests stayed where it
was.

The most useful open defect for a real catalogue is the 8-digit one. About 1 in 10 UPC-E short
codes also pass the GTIN-8 check digit. `01234565` is the UPC-E form of UPC-A `012345000065`, and it
is also a well-formed GTIN-8. A GTIN-8 starting with 0 is a restricted circulation number, so in
North American data the UPC-E reading is almost always the right one. The tool kept it as a GTIN-8
with no finding, and listing both forms of the same product raised no duplicate warning.

## Fixed in the same PR

PR #18548 fixes all six open or partial defects:

- an 8-digit code that reads both ways is kept as written, warned about with its UPC-A form, and
  matched against that UPC-A as a duplicate, in either order;
- `980` refund receipts and GTIN-8 codes starting with 0 or 2 are flagged;
- decimal-comma scientific notation from European Excel is read;
- repair writes empty rows and CRLF line endings back as they were;
- the README and FAQ say a check digit "agrees" rather than "proves";
- seven new tests, which catch all three surviving mutants (48 tests pass).

Scores stay as found on arrival. A later round re-audits before anything moves.

## The pattern

This is the second re-audit today where every defect had been counted fixed and some were not
([QIF file check](2026-11-24-quality-reaudit-qif-file-check.md) was 4 of 7). A fix PR that only
writes the remaining defects into "Known gaps" is honest in the product and invisible to the
scoreboard. The `mark-fixed` step on the audit file is what keeps the two in step; this run marked
the three that #15073 did close.

Not legal, tax or professional advice; a valid check digit does not show that GS1 issued a code to
you.
