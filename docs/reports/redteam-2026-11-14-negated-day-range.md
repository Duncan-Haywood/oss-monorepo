---
kind: note
date: 2026-11-14
topics: [redteam, ci]
---
# Negated day range; Date.UTC on raw regex groups (redteam, 2026-11-14)

**State after this run.** `platform/ci/check_calendar_dates.py` flags the
negated range `d < 1 || d > 31` (alongside `d >= 1 && d <= 31`) on a line
that also tests a month (`<= 12`, `< 12`, `> 12`, `monthOk`), unless a
calendar check sits on that line or the 12 after it. The window was 4 lines.
Calendar checks now include `getUTCMonth()`, `getMonth()`, `realDate(` and
`*Checked(`. The tree is clean. It is still wired only through
`unwired_checks.py` (see the open 2026-11-12 entry for the portfolio-validate
step).

Fixed this run, each with a failing test first: ad-spend-saturation-optimizer,
customer-lifetime-value-predictor, economic-nexus-threshold-tracker (both
branches of `parseDate`; the ISO branch also took month 13), einvoice-preflight
(CZ 10-digit birth number now uses `realDate`), lien-waiver-checker,
qif-file-check (validate and repair), service-load-check, clearance-markdown-planner,
price-elasticity-estimator, demand-charge-interval-analyzer,
truck-detention-pay-calculator, final-paycheck-deadline-calculator.

**Not linted yet: regex groups straight into `Date.UTC`** with no range check
(`Date.UTC(+m[1], +m[2] - 1, +m[3])`). A trial pattern
`Date\.UTC\([^;]*?\b\w+\[\d\]\)? - 1, ?\+?(?:Number\()?\w+\[\d\]` matched 71
lines. With the 12-line window it reported 9 without a round trip, but missed
clearance-markdown-planner and final-paycheck-deadline-calculator (an unrelated
`getUTCDate` nearby) and hit ai-bookkeeper/bank.mjs:1326 and
xero-bank-statement-csv-check/calc.mjs:239, which need reading. Still unchecked:
shift-roster-builder calc.mjs:348 `utcDay` (did not reproduce through
`applyTimeOff`) and cli.mjs:363. A good next guard is a lint for that shape
that requires the round trip inside the same function, not a fixed line window.
