# SaaS Annual Plan Discount Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/saas-annual-plan-discount-calculator/>

A free browser calculator for SaaS and subscription founders: **what annual-prepay
discount is worth offering.** Entirely client-side; nothing is uploaded.

After using this, you can now **see the largest annual discount that still leaves
an annual customer worth as much as a monthly one, on your own margin, churn and
cost of capital**, which used to mean building a cohort spreadsheet or guessing
"two months free".

## Inputs

Monthly price, gross margin, monthly churn on monthly plans, expected annual-plan
renewal rate, the discount you are considering, an optional share of customers who
would switch, annual cost of capital, an optional payment fee, and a 12/24/36 month
horizon.

## Outputs

Per customer signed up: present value of gross profit on the monthly plan and on
the annual plan, cash collected up front, the break-even (NPV-neutral) maximum
discount found by bisection, the months-free equivalent (12 x discount), and a
sensitivity table of discounts (0-30%) by monthly churn (0.5x, 1x, 1.5x, 2x of
your input).

## The model (stated so you can disagree with it)

- Time in months; cash at month t is discounted at `(1 + k)^(t/12)`.
- **Monthly plan:** paid at the start of each month; churn is geometric, so a
  customer is still paying in month t with probability `(1 - churn)^t`.
- **Annual plan:** paid up front at `12 x price x (1 - discount)`; no mid-year churn
  or refunds; renews into year y with probability `renewalRate^y`.
- **Cost to serve:** `price x (1 - gross margin)` per month for every active month on
  either plan. The annual plan gets the cash early, not the cost.
- **Payment fee:** percent of each charge, only if entered.
- **Break-even discount:** largest d with `PV_annual(d) >= PV_monthly`, by bisection.
  `PV_annual` is linear in d, so the tests check bisection against the closed form.
- At a 12-month horizon only one annual payment falls in the window, so the renewal
  rate has no effect; use 24 or 36 months to test it.
- The **switch share** scales the dollar effect per customer, not the break-even.
- Cash after the horizon is ignored for both plans.

## What this does not cover

Expansion revenue, taxes, failed-payment recovery, refunds, seasonality, and the
selection effect: customers who choose annual are often the ones least likely to
churn anyway, which flatters the annual plan. Results are estimates on your own
inputs.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

## Privacy

Everything runs in your browser. Inputs are never uploaded. Anonymous feature
counts live only in local storage and can be turned off on the page.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
