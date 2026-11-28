---
title: "Re-audit: Shift Roster Builder closes three defects, and an overnight fix that sat unmerged lands"
seo_title: "Overnight shifts and daily overtime: a scheduler re-audit"
date: 2026-11-28
tags: [quality-audit, evaluation, scheduling, overtime, payroll, shift-roster-builder]
description: "Shift Roster Builder re-checked against its 2026-11-19 audit: three of six defects closed, five of six hand-computed weekly costs right, overnight fix landed."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) builds a
weekly roster for a small team: you list the shifts and the people, and it
returns a roster and its weekly cost under federal or California overtime
rules. The [2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-shift-roster-builder-r4.json)
found six defects, and two PRs later claimed fixes for three of them. This
re-audit checked all six against the code as it stood this morning
([audit file](../../portfolio/quality/audits/2026-11-28-shift-roster-builder-reaudit.json)).

**Three of six defects are closed.** These three hold:

- A 15-year-old in a school week can now work 8 hours on a Saturday, as
  29 CFR 570.35(a)(2) allows. A 4-hour Monday shift is still left open at the
  3-hour school-day limit, which is correct.
- A first shift line with no commas (`Mon 8am-5pm`) now gives an error. It
  used to be dropped without a word. A real header row is still skipped.
- The disclaimer now says what the tool checks: the named fair-workweek
  presets and the federal limits for ages 14 and 15.

A seeded bug in each of the first two is now caught by a test.

**Weekly costs: five of six right, by hand.** These are one person at $20 an
hour, computed from the statutes and run through the product's own engine:

| week | rule | by hand | tool on arrival |
|---|---|---|---|
| 5 × 10 h | FLSA, OT over 40 | $1,100 | $1,100 |
| one 13 h day | California, OT after 8, DT after 12 | $320 | $320 |
| 5 × 9 h | California | $950 | $950 |
| 6 × 8 h | California, weekly OT on non-premium hours | $1,040 | $1,040 |
| 5 × 9 h, 30 min unpaid meal | FLSA | $875 | $875 |
| Sat 8pm–Sun 6am | daily OT after 8 | $200 | **$220** |

The miss is the oldest open defect. The planner put every hour of an
overnight shift on the day it started, so a 10-hour Saturday-night close
showed 2 hours of daily overtime. The product's own timesheet splits the same
shift at midnight into 4 hours and 6 hours, which gives no overtime. A fix,
PR #19894, was written yesterday. It sat unmerged because its CI went red on
a test in the blog build, not in this product. This PR brings in its code,
test, README and customer-post changes, and the planner now prices that shift
at $200.

**Verification.** All 82 test files ran this time: 787 of 787 passed in
277 seconds. The last audit ran 6 of them. I seeded four bugs:

- the weekend youth cap;
- the comma-less-line check;
- the 40-hour weekly overtime default;
- the meal-break boundary.

The first three were caught, the third only by the full suite. The fourth
survived every test: it took the meal off a shift of exactly five hours,
which California Labor Code 512(a) does not require. This PR adds a test
that catches it and pins the 40-hour default in the core test file.

**Not at the bar yet.**

- **Code size.** `calc.mjs` is one 6,088-line module.
- **README.** It is 544 KB, with changelog prose mixed in among the
  manager's instructions.
- **Unmeasured claim.** "An hour of spreadsheet shuffling" saved is still
  not measured.
- **Canonical link.** The page's canonical link is still relative.

These keep craft at 2.

**Not run:** the page in a browser, the self-hosted server end to end, and
the hosted team hub. The README says plainly that the hub is not deployed.

Planning aid, not payroll or legal advice. The overnight split assumes a
midnight-to-midnight workday, and your payroll may define the workday
differently.
