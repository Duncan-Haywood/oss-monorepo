# Shift Roster Builder

A free browser tool for restaurants, cafés, salons, shops and clinics that schedule named people by the week: **list the
shifts you need covered and your staff with availability, weekly hour limits and wages, and get a roster that covers as
many shifts as possible, avoids overtime, respects rest gaps, and tells you which shifts it could not fill and why**.
Nothing is uploaded.

After using this, you can now **build a week's schedule that nobody has to be moved around in, see which shifts are
unfillable before the week starts, and find the people the week depends on**, which used to be an hour of spreadsheet
shuffling on Sunday night.

## Model

- People: `name, wage, max hours, min hours, availability, roles: cook|server, prev: Sun 10pm` (`prev:` is when their last shift last week ended, so the rest rule holds across the week boundary; `Mon-Fri 9-17; Sat 10am-2pm; Sun off`; blank = any time; roles optional).
- Shifts: `day(s), start, end, people needed, label, role: cook` (the role is optional; a shift with a role goes only to people who list it). An end at or before the start runs overnight.
- Hard rules, never broken: availability covers the whole shift, no double-booking, minimum rest between shifts, max
  hours per week, max days in a row.
- Objective, in order: cover as many shift-hours as possible; then minimise real payroll (wage x (1 + extras), overtime
  above a threshold at a multiplier) plus soft penalties for hours under a person's minimum and for hours far from a fair
  share (balance slider).
- Search: greedy build (most constrained shifts first) then seeded simulated annealing with reassign and swap moves over
  several restarts. Deterministic. Tests check every roster against the hard rules and compare with an exhaustive search of
  all rosters on small problems.
- Reports: who is on each shift, shifts nobody could take and the reason, hours and pay per person, who the week depends on
  (rebuild without each person), and a comparison with filling shifts in listed order. CSV exports, and a `.ics` calendar file for the week (everyone, or one person to hand them their own shifts).

- What-if: when shifts stay open, rebuilds with one extra person free at any time (average wage, 40 h) and reports the hours it would cover and the payroll it adds.

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
