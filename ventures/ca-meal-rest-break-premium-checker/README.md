# California Meal & Rest Break Premium Checker

Free, browser-only audit for California meal and rest break premium pay (Labor
Code section 226.7). Paste timecards with the meal period and rest breaks taken.
It reports:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ca-meal-rest-break-premium-checker/

- **Meal periods**: first meal not started by the end of hour five, shorter than
  30 minutes, or missing on a shift over five hours; the same for the second meal
  after ten hours.
- **Waivers**: a missing first meal on a shift of six hours or less and a missing
  second meal on a shift of twelve hours or less are listed as waived when the
  line says `waiver`.
- **Rest breaks**: ten minutes per four hours or major fraction, flagged when the
  recorded count falls short.
- **Premium**: one hour of pay for meals and one for rest, at most once each per
  employee per workday, with a by-day and by-employee roll-up and a CSV export.

Rules are editable, so other states' meal and rest rules can be typed in.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - timecard parsing, meal and rest rules, premium roll-up, exports.
- `usage.mjs` - local-only feature counters with an opt-out.
- `california-meal-break-premium-pay-explained.html` - guide with a worked example the test suite recomputes.

**No warranty.** Free and as-is; not legal advice. The preset summarises public
law, may be wrong or out of date, and ignores industry wage-order exceptions,
on-duty meal agreements and collective bargaining carve-outs. Verify every figure
with your wage order and an employment attorney.

**Privacy.** Everything runs in your browser; names and timecards are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
