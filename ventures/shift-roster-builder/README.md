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
- Dated time off: `off:` also takes dates, `off: 2026-11-04..2026-11-06; 2026-11-09 5pm-close`. A date applies only when it falls in the week you give as "Week starting", so one staff list holds a whole month of vacations and each week uses its own (`datedDays` in `calc.mjs`). Without a week start the page says the dated entry was not applied.
- Soft preference: add `avoid: Sat; Fri 5pm-close` to a person to keep those hours free when anyone else can cover them. Unlike `off:` the hours stay allowed, each hour inside costs half the person's wage in the search (`avoidValue`), and the page warns when someone still works inside their avoid window (`parseStaff`, `avoidMinutes` in `calc.mjs`).
- Soft wish: add `prefer: Sat; Fri 5pm-close` to give a person extra hours they want. Each hour inside earns a small bonus in the search (`preferValue`, a quarter of the wage), so it breaks ties toward them but never leaves a shift open or beats a real payroll saving.
- Daily overtime: set "Daily overtime after" (and optionally "Double time after") or pick a state preset (California 8/12, Alaska 8, Colorado 12). Hours over the daily line pay the overtime multiplier, hours over the double-time line pay 2x, and weekly overtime applies only to straight-time hours beyond the weekly line. A shift counts on the day it starts. The search prices this, so it splits long days across people when that is cheaper. Presets are a convenience, not legal advice: check your state's current rules (7th-consecutive-day premiums are flagged when someone works all seven days but not priced; Nevada's wage test is not modelled).
- Shifts: `day(s), start, end, people needed, label, role: cook` (the role is optional; a shift with a role goes only to people who list it). An end at or before the start runs overnight.
- One qualified person per shift: `role: keyholder x1` on a shift row of 3 people needs just one keyholder; the other two copies take anyone. Without `x1` every copy needs the role (`parseShifts` in `calc.mjs`).
- Pinned shifts: add `fixed: Ana` to a shift row to lock it to Ana (`fixed: Ana + Ben` pins copy 1 and copy 2; copies beyond the names stay open). Everyone else is planned around it; if Ana is not free for the whole shift it comes back unfilled with that reason, and a name not in the staff list raises a warning.
- Unpaid meal break: set "Unpaid meal break on shifts over (hours)" and the break length (default 30 min) and any shift longer than that loses the break from paid time in payroll, daily and weekly overtime (`paidMinutes` in `calc.mjs`). The shift still blocks the whole person-time, so availability, rest and hour caps are unchanged; breaks are not placed on the clock.
- Split-shift premium: enter a dollar amount per split day (California: one hour at minimum wage) and the gap that counts as a split (default over 1 hour). Each day a person's shifts have a longer gap adds the premium (with burden) to their pay, so the search splits the day across people or closes the gap when that is cheaper; people on split days are marked in the table (`splitDays` in `calc.mjs`). The state's exemptions (pay already well above minimum wage) are not modelled: enter the amount you actually owe.
- Pay differential: give hours (written like availability, e.g. `Sat-Sun; Mon-Fri 22-24; Tue-Sat 0-6`) and an extra dollars per hour and/or a percent of each person's wage. Every scheduled hour inside those windows adds the premium to payroll (with burden), and an overnight shift gets its after-midnight hours from the next day's window. A percent premium makes a high-wage person dearer on those hours, so the search shifts them to cheaper staff when it can; it never leaves a shift open for it. You enter the rate; no state or union rule is built in (`differentialMinutes` in `calc.mjs`).
- Tip pool: enter a tip pot and the page splits it in proportion to scheduled hours, in whole cents that add back to the pot exactly (`tipPool` in `calc.mjs`). A planning aid; who may share in a pool is the employer's to decide.
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

- Collect availability from your team: "Collect your team's availability" makes a link to `availability.html`, a phone-friendly week grid each person fills in; it hands them one line to text or email back (`Ana | Mon-Fri 9-17; Sat off | max: 25 | off: Wed`). Paste the lines into the page and `mergeAvailabilityReplies` replaces each person's availability, keeping the wage, roles, `prev:` and your min hours, and only ever lowering max hours. Unknown names are added with no wage so the page asks for it. No server: the link holds only the business name, week and an optional name (`availabilityFromGrid`, `parseAvailabilityReply` in `calc.mjs`).

- Hour-by-hour coverage: a headcount grid for each clock hour of the week, darker when busier, so hours with one person alone stand out (`coverageGrid` in `calc.mjs`).

- Labor %: add projected sales and a target labor percentage to see payroll as a share of sales and the dollars under or over target (`laborPercent` in `calc.mjs`).
- Sales per labor hour: with sales by day and a target sales per labor hour, a table shows the hours each day's sales call for against the hours scheduled, and which days run heavy or light (`salesPerLaborHour` in `calc.mjs`). A guide only; the builder fills the shifts you list.
- What-if: when shifts stay open, rebuilds with one extra person free at any time (average wage, 40 h) and reports the hours it would cover and the payroll it adds.

- Carry over last week: choose last week's roster CSV and every person who worked gets a `prev:` cell with when their last shift ended (overnight closes written as `Sun 25:00`), so the rest rule holds across Monday (`carryOverStaff`).

- Returning each week: people, shifts and settings are remembered in this browser's local storage only ("Forget saved data" removes them), and can be saved to or loaded from a `roster-setup.json` file to move between devices.

Guide pages, each with figures a test re-derives from the engine: [how to make an employee schedule](how-to-make-an-employee-schedule.html), [clopening](how-to-avoid-clopening.html), [overtime](how-to-reduce-overtime-in-a-schedule.html), [labor cost by day](labor-cost-percentage-by-day.html), [hiring test](do-i-need-to-hire-another-employee.html) and [covering a call-out](how-to-cover-a-shift-when-someone-calls-out.html).

## What you use today, and what this does differently

- **Paper, a whiteboard or a spreadsheet:** free and private, but you check availability, rest gaps and overtime by eye, and nothing tells you a shift is unfillable until Sunday night.
- **Subscription schedulers** (7shifts, When I Work, Homebase, Deputy and similar): staff apps, shift swaps, time clocks and payroll hand-off. They want accounts for you and your staff, and most price per user or per location. This tool does none of that. It solves one week at a time with no signup and no upload.
- **What this adds:** a solver that fills as many shifts as the rules allow, prices overtime and split shifts, names the shifts it cannot fill and why, and shows who the week depends on. Your staff list stays in your browser. If you need staff-facing apps, a time clock or multi-week publishing, a subscription product is the better fit.

## Limits

Not modelled: predictive-scheduling and fair-workweek rules as built-in law (the changes report prices a rule you enter), paid rest breaks (unpaid meal breaks are deducted from paid time; a suggested meal-break time is shown but not enforced by the search), minor-labor limits beyond the per-person daily cap, union rules, seniority, time-off across weeks. A
heuristic search, not a proof of optimality on large problems. Verified only against exhaustive search and invented data.
Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.

**Seventh-day premium, for scale.** When someone works all seven days, the notice adds what a seventh-consecutive-day premium would cost if you applied 1.5x for the first 8 hours of Sunday and 2x after (extra over straight time, burden included; `seventhDayPay` in `calc.mjs`, which takes your own multipliers). It assumes a Monday workweek start and is not priced by the search or a statement of what any state requires.

**Sick-call finder.** After a roster is built, pick any shift (or an open one) to see who could take it without changing anyone else's week, cheapest first with overtime flagged, and which rule blocks everyone else (`coverOptions` in `calc.mjs`).

**Schedule flags.** After a build, the page flags days over 8 hours, split shifts with a gap over an hour, and a week that starts inside 14 days of today when you give the Monday (`scheduleFlags` in `calc.mjs`). These are heads-ups for daily-overtime, split-shift, meal-break (a straight stretch over 5 hours, back-to-back shifts joined; breaks are not scheduled) and fair-workweek rules the search does not enforce. It also flags a straight stretch over 5 hours (back-to-back shifts joined) as a meal-break heads-up; breaks are not scheduled.

**Wall copy.** "Print a wall copy" prints only the week grid (names and shifts, titled with the Monday if you gave it), with no wages, payroll or notices, so it can be posted in the break room (`@media print` in `index.html`).

**Shift swaps.** The same panel also lists one-for-one trades for the chosen shift: another person takes it and hands back one of theirs, with both weeks still passing every hard rule and the payroll change of the pair, so a swap request can be answered even when nobody can take the shift outright (`swapOptions` in `calc.mjs`).

**Each day against sales.** Optionally give sales for Monday to Sunday and the report adds a per-day table of scheduled hours, base-wage payroll (plus extras) and labor share of that day's sales, with the highest-share day marked, so a slow Tuesday stacked with staff stands out (`dailyLabor` in `calc.mjs`). Overtime premiums are priced weekly and are not spread over days.

**Getting under budget.** When you give projected sales and a target labor %, and the roster is over it, the report lists the biggest single payroll savings from dropping one assignment, safe cuts first (another person still works that shift), flagging cuts that leave a shift empty or put someone under their minimum hours (`trimOptions` in `calc.mjs`). Savings are per cut and do not add up exactly, because overtime is priced across the week. It lists options; it does not re-run the roster.

**Spreading tough shifts.** Set "Spread weekend, closing and opening shifts" (0-100, default 0 = off) and the search penalises each person's squared count of those shifts, so a fixed number of them is shared out evenly; it never leaves a shift open to do so (`toughBalance`, `toughPenalty` in `calc.mjs`).

**Fairness across weeks.** Add `tough: 3` to a person's row (weekend, closing and opening shifts they worked recently) and, when the spread setting is above 0, each new tough shift costs more for them than for someone with a lighter history, so the closes rotate instead of landing on the same people every week. "Carry over last week" fills it in: last week's tough shifts plus half of the old tally, so older weeks fade (`toughCounts`, `carryOverStaff`, `toughPenalty` in `calc.mjs`).

**Who gets the tough shifts.** The report counts each person's weekend, closing (10pm or later, or past midnight) and opening (6am or earlier) shifts and says so when the spread is 3 or more, so one person is not quietly handed every close. A report; the search balances it only when you raise the spread setting above (`fairnessReport` in `calc.mjs`).

**Changes since you posted it.** Choose the roster CSV you posted, give the Monday and when you made the change, and the report lists every shift that was added, cancelled or moved, the notice each got, and the premium pay under a rule you enter yourself (notice window in hours, premium in hours of pay, names of employee-requested changes left out). Fair-workweek laws differ by city and change, so the tool ships no jurisdiction presets and states no legal requirement; it does the arithmetic on your numbers (`parseRosterCsv`, `scheduleChanges` in `calc.mjs`).

**Weekly-hours line.** Optionally give an hours line to watch (for example 30, where some employers owe health coverage or benefits) and the report lists who is at or over it and who is within 2 hours under, so a few hours can be moved on purpose. A list only: it does not enforce the line and states no legal requirement (`hoursThresholds` in `calc.mjs`).

**Meal-break times.** For every straight stretch over 5 hours the page suggests a 30-minute break that begins before the 5th hour and is staggered so the most other people stay on the clock, and says when nobody else would be on (`placeBreaks` in `calc.mjs`). A greedy planning aid, not enforced by the search.

**Out for several days.** Pick a person and the days they are out and every shift they hold on those days is handed to someone else, the fewest-options shift first and each to the cheapest person who can take it, with the roster updated between hand-overs so nobody is double-booked or pushed past a weekly, daily, rest or days-in-a-row rule. Nobody else's existing shifts move; a shift nobody can take stays open with the rule that blocks each candidate. A greedy plan, not a proof of the cheapest split (`absencePlan` in `calc.mjs`, built on the sick-call finder).

**Post for the open shifts.** "Write one post for the open shifts" makes a single message for the team chat listing every shift still open (dated when you give the Monday) and, from the sick-call finder, anyone who could take it without moving another shift; with nobody listed it invites anyone free to claim it. No pay figures (`openShiftPost` in `calc.mjs`).
