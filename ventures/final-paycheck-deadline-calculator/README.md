# Final Paycheck Deadline Calculator

A free browser calculator for the legal deadline on a departing employee's
final paycheck, by US state and separation type. Entirely client-side;
nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/final-paycheck-deadline-calculator/

After using this, you can now **see the actual calendar date a final
paycheck is legally due, for the state and separation type that applies**
— which used to take reading a payroll-compliance blog's state table and
doing the day-counting by hand.

## Why this exists

Verified via WebSearch on 2026-09-25 against state statute citations, state
labor-department pages, and multiple independent payroll-compliance and
employment-law explainers (Rippling, Paycor, the Texas Workforce
Commission, the Colorado Office of the State Controller, Massachusetts's
Wage Act guidance, and others), cross-checked against each other:

- **The deadline varies enormously by state, and the split between "fired"
  and "quit" often matters as much as the state does.** California,
  Colorado, Massachusetts, and Nevada require same-day payment when an
  employee is fired or laid off; Illinois, New York, and Washington allow
  until the next regularly scheduled payday for either separation type;
  Texas gives 6 calendar days for a firing; Arizona gives 7 working days
  or the next payday, whichever is sooner; Montana and Nevada apply an
  "earlier of two deadlines" rule for a voluntary quit.
- **California's voluntary-quit rule turns on notice, not on state
  boundaries alone.** An employee who gives at least 72 hours' notice
  before quitting is treated the same as a firing — paid on the last day
  worked. Without that notice, the employer has 3 calendar days instead.
- **Minnesota's deadline for a firing is triggered by a demand, not by
  time alone.** Wages become due upon the employee's written demand for
  payment, and the employer then has 24 hours from that demand — not from
  the separation itself — before being in default.
- **Whether accrued vacation/PTO must be paid out is a separate legal
  question from the deadline, and it does not track the same states.**
  California, Colorado, Massachusetts, Montana, and Illinois treat it as
  earned wages that cannot be forfeited. Every other state modeled here
  leaves it entirely to the employer's written policy or the employment
  contract.

## Try it

Open [`index.html`](index.html). Choose a state and separation type, enter
a separation date, then click **Check**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`finalPaycheckDeadline`** — resolves the applicable deadline rule for a
  state and separation type (including California's notice branch and
  Minnesota's demand branch), computes the actual calendar date from a
  separation date (and, where the rule needs one, a next scheduled payday
  or a demand date), and reports whether accrued vacation/PTO must be paid
  out as wages.
- **`formatDate` / `money`** — display formatting.

## What this does not cover

- Not a determination of which state's law governs a given employee — you
  choose the state; the tool does not infer it.
- No city or county ordinances, which can be stricter than state law.
- No commissions, bonuses, or expense reimbursement timing rules.
- Eleven states only (California, Colorado, Massachusetts, Montana,
  Illinois, Minnesota, Arizona, Texas, New York, Washington, Nevada); every
  other state uses a general next-payday default.
- Point-in-time figures; a state's statute can change.

## Disclaimers

Not legal, tax, or financial advice. This applies a published state
statute to the dates you enter; it is not a substitute for reviewing
current state guidance or consulting a qualified employment attorney or HR
compliance professional.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The dates and figures you enter are
**never uploaded** — there is no server component at all. Anonymous
feature events (`deadline_calculated`, `example_loaded`) are counted in
`localStorage` only, never transmitted. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
