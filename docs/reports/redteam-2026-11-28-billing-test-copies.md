# Red team 2026-11-28: the five billing copies now share one test suite

Five paid products (payapps, jobshop-quote, cmmc, seller-books, einvoice-pro)
each carry `packages/billing/`. `platform/ci/check_billing_copies.py` already
held their shared source byte-identical, but their test files were allowed to
differ, with only a printed note.

## What the run found

- 24 mutants seeded: payapps `lien-waivers/src/notices.ts` (6 of 8 caught, the
  2 escapes equivalent: a type annotation and an out-of-range loop read the
  `if (b)` guard skips), `lien-waivers/src/tx-dates.ts` (8 of 8) and cmmc
  `billing/src/subscription-events.ts` (7 of 8, the escape a type annotation).
- The real defect was in the guard. 19 test cases covered one or two copies and
  not the rest: forged-webhook `h1` length checks, plan keys that exist only on
  `Object.prototype`, the event stamped at the ordering watermark itself, the
  quota period that starts at the anchor instant, the portal's cancel deep link,
  and host-name parsing on the pay page. Checked by hand: with `<` changed to
  `<=` in cmmc's `staleReason` (which would drop Paddle's sibling events sent at
  the same instant), cmmc's old suite passed 9 of 9 and the ported suite fails 1.

## What changed

- Every shared `*.test.ts` is now the union of the copies' cases and identical
  in all five copies (the 128-149 tests per copy pass; `tsc --noEmit` is clean
  in each).
- `check_billing_copies.py` fails on a shared test file that differs, unless it
  is named in `TESTS_ALLOWED_TO_DIFFER` with a reason (empty today).

## For the next run

A test fix in one billing copy now has to be copied to the other four, as a
source fix already did. If the copies ever need a product-specific case, put it
in its own test file (a file only one copy has is not checked) rather than
adding it to the entry list.
