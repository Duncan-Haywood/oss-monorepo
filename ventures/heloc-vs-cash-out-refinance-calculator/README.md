# HELOC vs Cash-Out Refinance Calculator

A free browser tool for homeowners who need cash and have two ways to get it: keep the mortgage they
have and add a HELOC, or refinance everything into one bigger loan. Type the cash, the current balance,
rate and years left, the HELOC's average rate, costs and interest-only period, the new mortgage's rate,
term and costs, how long you expect to keep the debt, the return on your money and your tax rate. It
returns the total cost of each route at your horizon, the payments before and after the interest-only
period, the yearly repricing cost of refinancing the balance you already had, the HELOC rate at which the
routes tie, and a table showing the result if the HELOC rate rises. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/heloc-vs-cash-out-refinance-calculator/

After using this, you can **see whether a low-rate mortgage is worth protecting and how high the HELOC
rate can go before the refinance wins**, instead of comparing two rates that apply to different amounts.

## Try it

Open [`index.html`](index.html) and click **Compare the two routes**.

## The model

[`calc.mjs`](calc.mjs), pure functions, monthly schedules. Route A is the old mortgage unchanged plus a
HELOC (interest-only for the draw period, then amortizing). Route B is one new loan of balance plus cash.
Cost by month t is the future value of after-tax payments at the return on your money, plus closing costs
compounded the same way, plus the debt still owed. The tie rate is found by bisection.

## Limits

Defaults are placeholders, not a real offer. One average HELOC rate, fixed refinance rate, closing costs
in cash, no extra payments. Not lending, tax or financial advice.
