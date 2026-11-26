# Red team 2026-11-26: e-invoice header allowance sign on the base

Target: `ventures/einvoice-preflight` (for-profit #1 in `portfolio/monetization/transition.py`),
files `adjustment.mjs` and `mx-address.mjs`.

## Seeded faults

| file | seeded | caught | escaped | after the new tests |
|---|---|---|---|---|
| adjustment.mjs | 8 | 5 | 3 (1 equivalent, 2 gaps) | all non-equivalent caught |
| mx-address.mjs | 8 | 7 | 1 gap | caught |

- `adjustment.mjs`: a null header row would throw in `headerAdjustmentNetDelta` if the
  row guard weakened; an array row would be reported as four "missing" findings instead
  of one "not an object". Both now pinned in `adjustment.test.mjs`. Skipping a zero
  amount in the net delta is equivalent (adding 0.00 changes nothing).
- `mx-address.mjs`: no test reached a postal code with more than five colonias, so the
  CCE129 message's list cut-off was unguarded; `cce20.test.mjs` pins it for 01650.

## Real defect, fixed

A negative invoice (negative net and gross) may state its header allowance or charge
with the sign on the base instead of the percentage: base -1500, percent 10, amount
-150.00. The checker already accepted the sign on the percentage (OpenPeppol's PINT
A-NZ example, -10% of 1500), but reported the signed base as INV-051 "base is missing
or invalid", a false finding on a file whose arithmetic is right. Both copies (JS web
checker and Python CLI) had it. Now a negative base is accepted on a negative invoice
and must still match amount = base x percent / 100; on an ordinary invoice it is still
a finding. Tests: `pint-current.test.mjs`, `tests/test_adjustment.py` (each fails
without the fix).

## Guard left behind

`adjustment-parity.test.mjs` feeds 1,500 seeded-random invoices (signs on amount, base
and percent; ordinary and negative; junk rows) to both the JS and the Python adjustment
checks and fails on any difference in findings or net delta, like
`date-parity.test.mjs` does for dates. Reverting only the Python half of today's fix
makes 261 of 1,500 disagree. Other JS/Python mirrors in this package (`linenet`,
`checks`) could get the same treatment; `linenet` is the next one worth it, since
it shares the negative-invoice sign rules.
