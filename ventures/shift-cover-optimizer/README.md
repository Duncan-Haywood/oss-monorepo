# Shift-Cover Optimizer

A free browser tool for restaurants, cafés, salons, shops and any small business that schedules by the hour: **paste how
many people (or how much demand) you expect in each open hour, and get the cheapest set of shifts that keeps every hour
covered**, what it saves against a fixed 8-hour template, and what your own scheduling rules cost. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/shift-cover-optimizer/

After using this, you can now **see exactly how much a fixed shift template, a 4-hour minimum or a 10% busier week costs
in payroll, and get a shift list you can copy into your schedule**, which used to be a whiteboard and a guess.

## Model

- Input: rows of `day, hour, value`. The value is headcount needed (header says staff/required) or demand such as
  customers per hour (header says anything else; then "one person handles N per hour" converts it). Hours may be `9`,
  `9:30` or `9am`; half-hour and quarter-hour data are detected. Rows you leave out are closed hours.
- Each open stretch of a day is solved separately (a shift never spans a closed gap). Shifts are intervals between the
  minimum and maximum length. Cost of a shift = wage x (1 + payroll burden) x (max(worked hours, minimum paid hours) +
  paid setup hours).
- Solved **exactly**: interval covering has the consecutive-ones property, so the LP is integral and equals a minimum-cost
  flow on a line graph; successive shortest paths (Bellman-Ford) finds the optimum. Tests compare it with brute force
  on random small problems.
- Compared with: the best plan using only one fixed shift length (your template), and everyone at the peak all day.
- Sensitivity: the cost of each minimum shift length, and of demand 10-30% higher or 10% lower.

## From a POS or booking export (2026-10-30)

`demandFromHistory(text, { stat, minShare })` reads a CSV with one row per order or sale and its date and time (ISO,
US `10/5/2026 1:30 PM`, or day-first when the first number is over 12), and returns `day,hour,value` rows for the
optimizer. The value is the sum of a sales/total/amount column when one exists, else the number of rows, averaged over
the dates seen for that weekday (`stat: "mean"`) or taken at the 80th percentile (`"p80"`, a busy day). An hour seen on
under 25% of a weekday's dates (`minShare`) is treated as closed, so one 3 am order does not open the shop; quiet hours
inside the open span stay open at zero. Wall-clock time as written is used (a trailing Z or offset is dropped). Tested on
hand-computed averages, the stamp formats and an end-to-end run through `optimize`; never run on a real POS export, so
column names from Square, Toast and others are guesses from their usual headers (wanted: a real export).

## Limits

Not modelled: who works which shift, availability, overtime and weekly hour caps, breaks, skills, predictive-scheduling or
fair-workweek laws, tips, or demand uncertainty inside an hour. It sizes the shifts; it does not assign people. Verified
only against brute force and invented data. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
