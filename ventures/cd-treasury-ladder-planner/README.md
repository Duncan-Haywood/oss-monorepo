# CD & Treasury Ladder Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cd-treasury-ladder-planner/>

A free browser tool for savers: **type the CD and Treasury rates you can get today and see an equally spaced
ladder with its after-tax yield per rung, when cash comes due, and how it compares with one long CD or rolling
short terms if rates rise or fall by up to two points.** Treasuries skip state income tax; CDs do not. Nothing
is uploaded.

## Model

- Quote line: months, APY %, `cd` or `treasury`. After-tax yield: CD `apy x (1 - fed - state)`, Treasury
  `apy x (1 - fed)`. Growth over m months `(1 + y)^(m/12)`.
- Curve = linear interpolation of the quotes of the chosen kind, flat beyond the ends.
- Ladder: rung j buys `j x spacing` months; on maturity it is reinvested for the time left to the horizon
  (`rungs x spacing`) at the curve plus a one-time parallel rate shift. Comparisons: everything in the longest
  term; rolling the shortest term.
- Tested identity: on a flat curve with no shift all three strategies end with the same money.

Run `node --test` in this directory.

## Not decided

Early-withdrawal penalties, callable CDs, FDIC/SIPC limits, auction mechanics, inflation, bill discount tax
treatment. Placeholder rates in the example are not quotes. Not financial advice.
