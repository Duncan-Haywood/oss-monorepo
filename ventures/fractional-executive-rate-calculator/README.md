# Fractional Executive Rate Calculator

A free browser calculator for fractional CFOs, CMOs, CTOs, COOs and other
part-time executives. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/fractional-executive-rate-calculator/

After using this, you can now **quote a day rate and monthly retainer that
replace the full-time package you are leaving** — after unsold days, admin and
business-development time, the benefits you now buy yourself and the payroll
tax you now pay — which used to mean a forum thread and a guessed multiple.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `rateFor` — revenue needed, billable and sold days, day and hourly rate, and
  the rate as a multiple of an employee's daily pay.
- `retainerFor` — monthly price for N days a month with an optional retainer
  discount, and the effective day rate after it.
- `parseClients` / `analyse` — a client mix (name, days per month) tested
  against capacity and your target, with plain-English findings.

## Limits, stated

Averages only: no income tax, equity upside, paid sick leave or slow
collection. Not tax, legal or financial advice. See the page.

## Tests

`node --test`
