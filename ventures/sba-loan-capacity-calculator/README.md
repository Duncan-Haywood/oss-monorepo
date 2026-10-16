# SBA Loan Capacity Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sba-loan-capacity-calculator/>

A free browser tool for small-business owners about to talk to a lender. Lenders size a loan backwards from cash flow:
**type in your cash flow, existing debt, rate, term and fees and get the largest loan a coverage floor (commonly 1.25x
DSCR) supports, how the loan you want measures up, and how term, rate and a weak year change the answer.** Nothing is
uploaded.

After using this, you can now **walk into a lender knowing how large a loan your books support and how much cash you
must bring, which used to mean guessing or waiting for a banker to run it**.

## Model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Cash flow available for debt service (CFADS) = net income + interest + depreciation + add-backs + owner pay adjustment
  - maintenance capex.
- Room for new debt per year = CFADS / required DSCR - existing debt service. Largest loan = that payment as a level
  monthly annuity at your rate and term.
- Fee is a % of the loan taken from proceeds, so it changes cash received, not capacity.
- Requested loan: business DSCR, global DSCR (adds household income, living expenses and personal debt), cash-flow
  cushion before the floor is missed, and the cash you bring (the larger of the equity injection and the gap the loan
  leaves).

## Limits

Not modelled: eligibility, credit, collateral, guarantees, variable rates, balloons, interest-only periods, the lender's
own adjustments, current SBA fee schedules (you type the fee). Verified only against textbook annuity formulas. Not
legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
