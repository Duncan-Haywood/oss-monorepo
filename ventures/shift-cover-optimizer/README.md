# Shift-Cover Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shift-cover-optimizer/>

A free browser tool for restaurants, cafés, salons, shops and any small business that schedules by the hour: **paste how
many people (or how much demand) you expect in each open hour, and get the cheapest set of shifts that keeps every hour
covered**, what it saves against a fixed 8-hour template, and what your own scheduling rules cost. Nothing is uploaded.

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

## Limits

Not modelled: who works which shift, availability, overtime and weekly hour caps, breaks, skills, predictive-scheduling or
fair-workweek laws, tips, or demand uncertainty inside an hour. It sizes the shifts; it does not assign people. Verified
only against brute force and invented data. Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
