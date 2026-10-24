# Grant Writer Proposal Price Calculator

A free browser calculator for freelance grant writers and nonprofit
consultants. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/grant-writer-proposal-price-calculator/

After using this, you can now **quote a flat fee per proposal that actually
pays the hourly rate you want** — after unbillable time, tax load, software
costs and the revision rounds every proposal collects — and see which fees you
already quoted fall below that floor.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `hourlyFloor` — the invoiced rate per estimated hour that delivers your target
  take-home.
- `priceFor` — estimated hours padded by a revision buffer, times the floor.
- `parseProposals` / `analyse` — proposals (name, hours, optional quoted fee and
  award) checked against the floor and your monthly capacity, in plain English.

Prices on hours only. A fee as a share of the award is a sense check, never a
pricing basis.

## Limits, stated

Averages only: no income tax return, travel, win rate or post-award reporting.
Not tax, legal or financial advice. See the page.

## Tests

`node --test`
