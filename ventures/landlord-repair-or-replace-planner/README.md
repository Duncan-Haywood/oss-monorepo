# Landlord Repair-or-Replace Planner

A free browser tool for landlords and homeowners: **paste or upload a CSV of your equipment (water heaters, furnaces,
AC, roofs, appliances) with age, repair quote and replacement cost, and see whether repairing or replacing costs less
over the years you will own the property, the most a repair can cost before replacing wins, and which replacements to
make first within a budget.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/landlord-repair-or-replace-planner/

After using this, you can now **decide a repair quote in a minute with a number behind it, and plan replacements
before they fail**, which used to take a rule of thumb and a guess.

## Model

- Input: rows of `asset,type,age,repair quote,replacement cost,savings per year,life` (a header may reorder columns by
  name; type, savings and life optional; a blank repair quote means a working unit with no quote).
- Failure: Weibull with mean = the unit's life (typical planning life by type, or the user's own) and a shape
  (default 3). The chance of failing within a year at age a is 1 − S(a+1)/S(a).
- Repair: pay the quote, unit stays at its current age, replace at its next failure. Replace: pay now, new unit at age 0.
  Each failure costs the replacement plus an extra unplanned-failure cost; each year a new unit runs saves the yearly
  savings. Yearly discounting over the horizon; straight-line credit for remaining life at the end.
- Break-even quote = replace-now cost minus the cost of the repair path before the quote. Verdict is "close call"
  when the two differ by under 5% of the replacement cost.
- Also shown: chance of failing within 1 and 3 years, the 50% rule of thumb, and whether the verdict flips with the
  life 25% shorter or longer. Optional budget: replacements chosen by advantage per dollar.

## Limits

Typical lives and the wear-out curve are planning assumptions, not fitted to failure data. Condition, brand,
rebates, taxes, code-forced replacement, partial repairs and price changes are not modelled. Arithmetic on supplied
numbers, not advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
