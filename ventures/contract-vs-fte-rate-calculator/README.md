# Contract vs. Salary Rate Calculator (W-2 to 1099)

A free browser tool for people weighing a salaried offer against contract work. Enter the
salary, bonus, 401(k) match, employer-paid health cover, paid time off and the contractor's
costs, and it returns the hourly rate a contract must pay to leave the same cash, a step-by-step
breakdown of where the extra rate comes from, and what a rate you were actually offered leaves
you. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/contract-vs-fte-rate-calculator/

## Try it

Open [`index.html`](index.html) and click **Find the break-even rate**.

## The model

[`calc.mjs`](calc.mjs), pure functions. Employee cash = (salary + bonus + equity) minus the
employee half of FICA. Contract cash = revenue - expenses - self-employment tax (15.3% of 92.35%
of net, Social Security capped at the wage base) - a health premium replacing the employer's -
a replacement for the 401(k) match. Revenue is hourly rate x hours x billable weeks (52 minus
unpaid time off minus bench weeks). The break-even is solved by bisection. Income tax is left out
of both sides.

## Limits

Defaults are placeholders. Income and state tax, QBI, S-corp or corp-to-corp structures, worker
classification, payment terms and unlisted benefits are not modelled. Not tax advice.

## Tests

`node --test`
