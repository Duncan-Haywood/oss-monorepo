# Wholesale vs Retail Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wholesale-vs-retail-pricing-calculator/>

A free browser tool for makers and small brands: enter your unit cost and retail
price and see **what you keep per unit and per order selling direct, wholesale or
on consignment**, after fees, shipping, your time, payment terms and sell-through.
It also gives the wholesale price that reaches your target margin and a table of
how profit moves as the wholesale share of retail changes. Nothing is uploaded.

## Model

- Direct = retail − cost − fee % − postage/packaging − handling time.
- Wholesale = retail × wholesale share − cost − bulk freight − handling − cost of money tied up during payment terms.
- Consignment (per unit placed) = retail × (1 − shop share) × sell-through − the cost of making and delivering every unit.

Not modelled: returns, markdown support, sales tax, unpaid invoices, brand effects.

## Run

Open `index.html` in a browser. Tests: `node --test`. MIT licensed; no secrets,
no accounts, no network calls.
