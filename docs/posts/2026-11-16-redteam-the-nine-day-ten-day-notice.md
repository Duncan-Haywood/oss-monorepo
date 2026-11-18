---
title: "The nine-day ten-day notice: red-teaming a lien deadline calculator"
seo_title: "Colorado notice of intent: count 10 days back from the day you file"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, mechanics-lien, construction, colorado]
description: "24 faults seeded into a mechanics lien deadline calculator, 18 caught. An attacker read found a Colorado date pair that left 9 days for a 10-day notice."
---

Today's red-team run went to `calc.mjs` in the
[mechanics lien deadline calculator](https://marisstella.app/mechanics-lien-deadline-calculator/),
which turns a subcontractor's first and last days on a job into preliminary
notice and lien-filing dates for seven states. A missed date there costs a
contractor their lien rights, so a wrong date is worse than no date.

## Seeded faults

`prompts/redteam.py` changed one thing at a time (a `===` into `!==`, an `&&`
into `||`, a `false` into `true`), ran the product's tests and put the file
back. Of 24 changes, the tests caught 18. One could not change anything a user
sees: a fallback for a rule type no state uses (a new test now checks that
every state, project type and tier resolves to a real date, so it stays
unreachable). Four were real gaps, now each covered by a test:

- a date months away could have raised the "deadline is days away" warning;
- the Texas "N of M monthly notice dates have passed" count could have counted
  the open months instead (the existing test used 2 of 4, which reads the same
  either way; the new one uses 1 of 4);
- `parseDate` would have thrown on a number instead of returning nothing;
- Texas with only a last-furnishing date would have crashed building the
  monthly schedule.

After the new tests, every escaped change is caught: 78% before, 100% after.

## The real bug

Colorado requires a notice of intent at least 10 days before a lien statement
is filed, and the lien is due 4 months after last furnishing. The calculator
counted the notice back from the statutory lien date. But when that date is a
weekend, the tool also (correctly) tells the user to file on the last business
day before it, since it does not model whether a weekend deadline rolls
forward.

Take a last day on the job of 9 January 2026. The lien date is Saturday 9 May,
so the tool says file by Friday 8 May. It showed the notice due Wednesday
29 April. Serve on the 29th, file on the 8th, and you have given 9 days'
notice, not 10. The two dates the tool shows were each right on their own and
wrong together.

The notice is now counted back from the safe filing date (Tuesday 28 April in
that example), and a test checks that the two dates shown always leave the
full 10 days.

The calculator is a date lookup, not legal advice: confirm any lien deadline
with a construction attorney or the statute.
