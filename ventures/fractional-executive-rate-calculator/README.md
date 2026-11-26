# Fractional Executive Rate Calculator

A free browser calculator for fractional CFOs, CMOs, CTOs, COOs and other
part-time executives. Nothing is uploaded.

**Live tool:** https://marisstella.app/fractional-executive-rate-calculator/

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

## Known gaps

From the quality audit of 2026-11-26
([`portfolio/quality/audits/2026-11-26-fractional-executive-rate-calculator.json`](../../portfolio/quality/audits/2026-11-26-fractional-executive-rate-calculator.json)):

- **Payroll tax is one flat rate on all revenue, business costs included, with
  no Social Security wage base.** IRS self-employment tax is 15.3% of 92.35% of
  net earnings, with the 12.4% part only up to the wage base ($184,500 in 2026).
  For the page's example the extra tax is about $15,830, not $23,194, so the day
  rate is about 2.5% high ($2,010 against $2,060), and more for higher earners.
- The "1.5x employee daily pay" rule of thumb is not cited.
- No profit or risk margin input; retainers can only be priced as days per month.

## Tests

`node --test`
