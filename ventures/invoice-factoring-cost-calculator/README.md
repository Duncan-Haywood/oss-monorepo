# Invoice Factoring Cost Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/invoice-factoring-cost-calculator/>

A free browser tool for freelancers, small contractors, staffing agencies and truckers: **enter an invoice, the days your customer takes to pay and
one or more factoring offers, and see the real cost in dollars, as a share of the invoice and as an annual rate**, plus the rebate and the yearly
cost at your volume. Nothing is uploaded.

After using this, you can now **compare factoring quotes on the same footing and see what a late-paying customer does to the fee**, which used to be
reading three rate sheets with different fee periods and guessing.

## Use

1. Open `index.html`, enter the invoice and one offer per line (`name, advance %, fee % per period, period days, flat fee, stepped|daily`), click Calculate the cost.
2. Pure logic is in `calc.mjs` (`plan()`, `costOf()`); tests: `node --test`.

Modelled: advance and reserve, stepped or daily fee accrual, flat per-invoice fees, rebate, simple annualised rate on cash advanced, monthly and yearly cost,
optional line-of-credit comparison. Not modelled: setup, termination and minimum fees, disputed-invoice fees, recourse, taxes. Not financial advice.
No warranty; see the page footer. MIT licensed (`LICENSE`).
