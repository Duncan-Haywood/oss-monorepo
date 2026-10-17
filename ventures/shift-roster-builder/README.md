# Shift Roster Builder

A free browser tool for restaurants, cafés, salons, shops and clinics that schedule named people by the week: **list the
shifts you need covered and your staff with availability, weekly hour limits and wages, and get a roster that covers as
many shifts as possible, avoids overtime, respects rest gaps, and tells you which shifts it could not fill and why**.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/shift-roster-builder/

After using this, you can now **build a week's schedule that nobody has to be moved around in, see which shifts are
unfillable before the week starts, and find the people the week depends on**, which used to be an hour of spreadsheet
shuffling on Sunday night.

## Model

- People: `name, wage, max hours, min hours, availability, roles: cook|server, prev: Sun 10pm` (`prev:` is when their last shift last week ended, so the rest rule holds across the week boundary; `Mon-Fri 9-17; Sat 10am-2pm; Sun off`; blank = any time; roles optional).
- Time off this week: add an `off:` cell, e.g. `off: Wed; Fri 5pm-close`, to remove whole days or hours from a person's standing availability without rewriting it (`applyTimeOff` in `calc.mjs`).
- Soft preference: add `avoid: Sat; Fri 5pm-close` to a person to keep those hours free when anyone else can cover them. Unlike `off:` the hours stay allowed, each hour inside costs half the person's wage in the search (`avoidValue`), and the page warns when someone still works inside their avoid window (`parseStaff`, `avoidMinutes` in `calc.mjs`).
- Soft wish: add `prefer: Sat; Fri 5pm-close` to give a person extra hours they want. Each hour inside earns a small bonus in the search (`preferValue`, a quarter of the wage), so it breaks ties toward them but never leaves a shift open or beats a real payroll saving.
- Daily overtime: set "Daily overtime after" (and optionally "Double time after") or pick a state preset (California 8/12, Alaska 8, Colorado 12). Hours over the daily line pay the overtime multiplier, hours over the double-time line pay 2x, and weekly overtime applies only to straight-time hours beyond the weekly line. A shift counts on the day it starts. The search prices this, so it splits long days across people when that is cheaper. Presets are a convenience, not legal advice: check your state's current rules (7th-consecutive-day premiums and Nevada's wage test are not modelled).
- Shifts: `day(s), start, end, people needed, label, role: cook` (the role is optional; a shift with a role goes only to people who list it). An end at or before the start runs overnight.
- Pinned shifts: add `fixed: Ana` to a shift row to lock it to Ana (`fixed: Ana + Ben` pins copy 1 and copy 2; copies beyond the names stay open). Everyone else is planned around it; if Ana is not free for the whole shift it comes back unfilled with that reason, and a name not in the staff list raises a warning.
- Unpaid meal break: set "Unpaid meal break on shifts over (hours)" and the break length (default 30 min) and any shift longer than that loses the break from paid time in payroll, daily and weekly overtime (`paidMinutes` in `calc.mjs`). The shift still blocks the whole person-time, so availability, rest and hour caps are unchanged; breaks are not placed on the clock.
- Hard rules, never broken: availability covers the whole shift, no double-booking, minimum rest between shifts, max
  hours per week, max days in a row, and (optional) most hours in one day: a roster-wide setting, or `daily: 8` in a person's row for a minor or a short-day contract.
- Objective, in order: cover as many shift-hours as possible; then minimise real payroll (wage x (1 + extras), overtime
  above a threshold at a multiplier) plus soft penalties for hours under a person's minimum and for hours far from a fair
  share (balance slider).
- Search: greedy build (most constrained shifts first) then seeded simulated annealing with reassign and swap moves over
  several restarts. Deterministic. Tests check every roster against the hard rules and compare with an exhaustive search of
  all rosters on small problems.
- Reports: who is on each shift, shifts nobody could take and the reason, hours and pay per person, who the week depends on
  (rebuild without each person), and a comparison with filling shifts in listed order. CSV exports, and a `.ics` calendar file for the week (everyone, or one person to hand them their own shifts), and a ready-to-paste text message per person ("Hi Sam, your shifts this week: ..."), dated when you give the Monday.

- Labor %: add projected sales and a target labor percentage to see payroll as a share of sales and the dollars under or over target (`laborPercent` in `calc.mjs`).
- What-if: when shifts stay open, rebuilds with one extra person free at any time (average wage, 40 h) and reports the hours it would cover and the payroll it adds.

- Carry over last week: choose last week's roster CSV and every person who worked gets a `prev:` cell with when their last shift ended (overnight closes written as `Sun 25:00`), so the rest rule holds across Monday (`carryOverStaff`).

- Returning each week: people, shifts and settings are remembered in this browser's local storage only ("Forget saved data" removes them), and can be saved to or loaded from a `roster-setup.json` file to move between devices.

## Limits

Not modelled: predictive-scheduling and fair-workweek notice rules, meal and rest breaks, minor-labor limits, split-shift
premiums, tips, union rules, seniority, time-off across weeks. A
heuristic search, not a proof of optimality on large problems. Verified only against exhaustive search and invented data.
Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

**Sick-call finder.** After a roster is built, pick any shift (or an open one) to see who could take it without changing anyone else's week, cheapest first with overtime flagged, and which rule blocks everyone else (`coverOptions` in `calc.mjs`).

**Schedule flags.** After a build, the page flags days over 8 hours, split shifts with a gap over an hour, and a week that starts inside 14 days of today when you give the Monday (`scheduleFlags` in `calc.mjs`). These are heads-ups for daily-overtime, split-shift, meal-break (a straight stretch over 5 hours, back-to-back shifts joined; breaks are not scheduled) and fair-workweek rules the search does not enforce. It also flags a straight stretch over 5 hours (back-to-back shifts joined) as a meal-break heads-up; breaks are not scheduled.

**Wall copy.** "Print a wall copy" prints only the week grid (names and shifts, titled with the Monday if you gave it), with no wages, payroll or notices, so it can be posted in the break room (`@media print` in `index.html`).

**Shift swaps.** The same panel also lists one-for-one trades for the chosen shift: another person takes it and hands back one of theirs, with both weeks still passing every hard rule and the payroll change of the pair, so a swap request can be answered even when nobody can take the shift outright (`swapOptions` in `calc.mjs`).

**Each day against sales.** Optionally give sales for Monday to Sunday and the report adds a per-day table of scheduled hours, base-wage payroll (plus extras) and labor share of that day's sales, with the highest-share day marked, so a slow Tuesday stacked with staff stands out (`dailyLabor` in `calc.mjs`). Overtime premiums are priced weekly and are not spread over days.
