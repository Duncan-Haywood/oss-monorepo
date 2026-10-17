# Med Spa Treatment Profit Calculator

A free browser calculator for med spas and aesthetics clinics. Nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/med-spa-treatment-profit-calculator/

After using this, you can now **see which treatments on your menu earn the most
per room hour and what price hits your target margin** — after product, card
fees, provider time and room overhead — which used to mean a hand-built
spreadsheet or guessing from the retail price.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `parseTreatments` — one treatment per line (comma or tab separated); bad lines
  are reported, never dropped.
- `treatmentEconomics` — contribution per visit, margin, contribution per room
  hour, break-even price and the price that hits a target margin.
- `analyse` — monthly mix, room capacity and fixed-cost checks, plain-English
  findings.

## Limits, stated

Averages only: no consults, no-shows, memberships, retail or tiered commission.
Not accounting, tax, legal or medical advice; margin is never a reason to
recommend a treatment. See the page.

## Tests

`node --test`
