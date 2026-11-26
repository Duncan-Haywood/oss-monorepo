---
kind: note
topics: [redteam, pay-application-generator]
date: 2026-11-26
---
# Red team 2026-11-26: pay-app retainage rounding on negative amounts

Target: `ventures/pay-application-generator/workbook.mjs` (front door to the
pay-app bet), with `calc.mjs` read alongside.

## Seeded faults

10 mutants, 7 caught; 3 escaped:

- `colName` divisor 26 -> 27: gap. Only 12 columns are ever used, but the
  function is exported; `workbook.test.mjs` now pins A, Z, AA, AZ, BA, ZZ, AAA.
- blank-template `tot()` fallback 0 -> 1: gap. The test called "zero totals"
  checked formulas only, never the cached totals a non-recalculating previewer
  shows. It now checks every SUM total caches 0.
- a column width 15 -> 16: equivalent (print layout only).

Catch rate 0.78 (equivalent excluded) -> 1.0 after the tests.

## Real defect, fixed

`calc.mjs` `mulBp` used `Math.round`, which rounds half toward +infinity:
10% of -1,234.55 gave -123.45 while 1,234.55 gave 123.46. The workbook's
`ROUND` (half away from zero) gave -123.46, so the LibreOffice recalculation
of a downloaded workbook was a cent off the page. `recalc.test.mjs` reproduced
it (0 vs 1 cent on line 5). Fixed with `roundCents` (half away from zero) in
`mulBp` and in the remaining-mode split of `workRet`. `sheet.mjs` money
parsing was already symmetric (rounds the absolute value).

## Guard left behind

`calc.test.mjs`, "retainage is odd-symmetric": 300 seeded lines with amounts
ending in 5 cents at 10/5/2.5% and random rates, asserting negating a line
negates its retainage. It runs in CI (the LibreOffice test skips there) and
fails on the old rounding.

## For the next run

`recalc.test.mjs` is the only check that formulas and page agree, and it skips
without soffice. This container has `/usr/bin/soffice`; the suite takes ~3 s
here. Whether `ventures-tests.yml` runners could install LibreOffice cheaply
is an open question worth one look.
