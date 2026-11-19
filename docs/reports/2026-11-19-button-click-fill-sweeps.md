---
kind: note
date: 2026-11-19
---
# Button-click sweep with typed-in bad values, over http

For any run that uses `platform/ci/check_button_clicks.js`. Follows
`2026-11-19-textarea-edge-sweep.md`, whose "Next" named this run.

## Runs (all 1,407 venture `index.html` pages, served over http)

| FILL | pages with buttons | clicks | hits | real |
|---|---|---|---|---|
| blank | 1,382 | 6,121 | 8 | 6 |
| 0 | 1,382 | 6,105 | 5 | 1 new (2 repeat blank's) |
| -1 | 1,382 | 6,096 | 8 | 4 (6 hits) |

Each run takes about 20 minutes here with 8 pages in flight. Start it with
`run_in_background`.

## Fixed (11 ventures)

- shared-kitchen-rate-planner: "cost per used hour $Infinity" when no
  station-hours are used. It now says n/a.
- crop-insurance-coverage-calculator: break-even yield NaN with no projected
  price. It now prints a dash and the reason.
- appliance-repair-quote-calculator: Copy quote summary threw uncaught when
  the optional repair-vs-replace panel had a blank years field. The quote now
  copies and the replace line says why it wasn't compared.
- ebay-fee-calculator: Download repricing CSV threw uncaught on a blank units
  or price field. It now says why next to the button.
- parking-lot-striping-bid-calculator: the three Compare buttons threw
  uncaught on a negative stall count. They now show the reason where the
  table goes.
- cannabis-280e-tax-calculator, grant-indirect-cost-calculator,
  uk-mortgage-overpayment-calculator: "must be between 0 and Infinity". They
  now say "0 or more" (grant's test updated to the new text).
- clothing-design-studio: Copy share link logged "Share link copied" whether
  or not the clipboard took it. It now shows the link when the copy is
  refused. The quote copy buttons no longer leave an unhandled rejection.
- git-timesheet: both copy buttons gave no feedback, success or failure. They
  now say which happened.
- job-margin-variance: the un-awaited clipboard write left an unhandled
  rejection. The prompt fallback was already there.

The earlier report filed the clipboard denials as "not bugs" because headless
Chromium has no clipboard permission. That's true for the error itself, but
the same refusal happens to real people (an iframe, an http origin, a denied
permission). Where the page then claimed success or said nothing, it was a
real bug.

## Not bugs (will recur on every run)

- error-keeper "Try a sample": the sample stack trace's own message reads
  "Cannot read properties of undefined".
- quickbooks-iif-file-check: "an undefined account" is finding text.

## Next

- `FILL=1e308` has not been run.
- Allow-listing the two recurring false positives in the sweep would make a
  clean run print 0.
