# SaaS CAC Payback Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/saas-cac-payback-calculator/>

A free browser calculator for SaaS and subscription founders: **how long a customer
takes to pay back what you spent to win them, once churn is counted.** Entirely
client-side; nothing is uploaded.

After using this, you can now **see churn-adjusted CAC payback, LTV:CAC and the most
you can spend per customer for your payback target**, which used to mean a cohort
spreadsheet or trusting the simple CAC / monthly-margin formula.

## Inputs

Fully-loaded CAC, monthly revenue per customer, gross margin, monthly churn, optional
monthly expansion of surviving customers, optional annual cost of capital, and a
payback target in months.

## Outputs

Simple payback, churn-adjusted payback (first month expected cumulative gross profit
reaches CAC, capped at 120), expected lifetime, LTV undiscounted and discounted,
LTV:CAC, maximum CAC for the target, and a table of payback by CAC (0.5x-2x) and churn
(0.5x-2x).

## The model

- Gross profit per month `m = price x margin`, collected at the start of each month.
- Survival `s = 1 - churn`; with expansion `g` the expected month-t profit is
  `m x r^t` where `r = s(1 + g)`.
- Cumulative profit over n months `= m(1 - r^n)/(1 - r)`; LTV `= m/(1 - r)`; the
  discounted LTV multiplies `r` by `(1 + k)^(-1/12)`.
- Payback is found iteratively and cross-checked against the closed form in the tests.

## What this does not cover

Tenure-dependent churn, annual prepay cash timing, sales-cycle delay, discounts, taxes,
and blended versus channel CAC. Benchmarks such as 3:1 and 12 months are common rules
of thumb, not guarantees.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not legal, tax, or financial advice, and it does not replace
a qualified professional. **You are responsible for reviewing and verifying its output
before relying on it.** To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature counts
live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
