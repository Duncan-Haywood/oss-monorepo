---
title: "The sample file works, the real export crashes: Math.max(...rows) in five analyzers"
seo_title: "Math.max spread crashes past 125,000 rows in JavaScript"
date: 2026-11-14
tags: [redteam, javascript, reliability, csv]
description: "Five of our CSV analyzers crashed on files of about 125,000 rows, all from one idiom: Math.max(...rows.map(f)). Fixed with loops; a lint stops new copies."
---

A red-team run today seeded twelve bugs into the
[restaurant delivery commission analyzer](../../ventures/restaurant-delivery-commission-analyzer/).
Its tests caught six. While reading the code for the kind of input a stranger
might upload, the run also found a real crash that no seeded bug imitates.

## One line, one crash

The analyzer works out the date range of an export like this:

```js
from: Math.floor(Math.min(...list.map((x) => x.t)) / DAY) * DAY,
```

The spread `...` passes each order's timestamp as a separate argument to
`Math.min`. JavaScript engines cap how many arguments one call can take. In
Node 22 (V8, the engine Chrome and Edge also use) the call failed somewhere
between 50,000 orders, which worked, and 130,000, which threw
`RangeError: Maximum call stack size exceeded`. 200,000 and 500,000 failed too.
The page showed nothing.

The sample file has 260 orders, so every test passed. A restaurant that does
350 delivery orders a day reaches 125,000 in a year. A year's export is the
file an owner is most likely to upload when they ask what delivery costs them.

## The same idiom in four more tools

A search for `Math.min(...` or `Math.max(...` over an array named after rows,
in files that parse an upload, found 21 files. Four more were tools where a
real export can pass that size, and each crashed on a synthetic 200,000-row
input:

| Tool | What 200,000 rows is |
|---|---|
| [customer-lifetime-value-predictor](../../ventures/customer-lifetime-value-predictor/) | a store's order history (8 spreads, in the summary, backtest and cohort code) |
| [stripe-failed-payment-recovery-analyzer](../../ventures/stripe-failed-payment-recovery-analyzer/) | a year of charges for a mid-size subscription business |
| [trial-conversion-timing-analyzer](../../ventures/trial-conversion-timing-analyzer/) | trial sign-ups for a large SaaS |
| [whatnot-sales-report-analyzer](../../ventures/whatnot-sales-report-analyzer/) | item rows for a high-volume live seller (the copy vendored into reseller-books is fixed too) |

Each fix is a loop or a `reduce`, which uses no extra stack:

```js
let tMin = Infinity, tMax = -Infinity;
for (const x of list) { if (x.t < tMin) tMin = x.t; if (x.t > tMax) tMax = x.t; }
```

Each tool now has a test that runs 200,000 rows through the function that
crashed. Each test failed before the fix and passes after it.

## Stopping the next copy

A red-team run happens on about one session in fourteen, so a fix that waits
for the next one is too slow. `platform/ci/check_row_spread.py` flags a
row-named array spread into `Math.min` or `Math.max` in any venture file that
parses an upload. The 19 files it still finds (its name list is a little wider than the first search) are listed in a
baseline. Mostly they hold smaller data, like a rent roll or a month-by-month
series. The baseline can only shrink: a new copy fails, and so does a listed
file that is fixed but still on the list. CI's unwired-checks step runs every
`check_*.py`, so the lint runs on pull requests without a workflow edit.

## The seeded bugs

The six mutants that got past the commission analyzer's tests are all covered
now:

- a clock reading of `12:60`, which the parser accepted;
- a 21:00 order that the dinner daypart would also count;
- the average ticket, which no test checked;
- a direct-ordering fee of 100% or more, whose check could be broken with no
  test noticing;
- the food-sales figure in the "orders lost money" finding;
- the example file's zero ad spend.

The catch rate on this file went from 6 of 12 to 12 of 12. The finding's
loss object was built twice, so it is now built once and passed in.
