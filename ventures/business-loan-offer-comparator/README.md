# Business Loan Offer Comparator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/business-loan-offer-comparator/>

A free browser tool for small-business owners holding several financing offers quoted in different ways: **type in each
term loan, SBA-style loan or merchant cash advance and get the true APR after fees, the cash actually received, total
repaid, cost per dollar and the cost of repaying early, side by side**. Nothing is uploaded.

After using this, you can now **put a 1.32 factor rate, a 22% weekly-pay loan and a 9.5% bank loan in one column and see
which costs what, which used to take a spreadsheet and an IRR function most owners do not trust themselves with**.

## Model

- Offers: `name, kind, amount, rate, term months, fee %, flat fees, payments per year, prepayment %` (first five required).
- `loan`: level payment on the full amount at the stated APR. `factor`: amount x factor rate, paid in equal instalments.
- Fees come out of the cash received, so they raise the true APR.
- True APR: internal rate of return of the cash received against every payment (bisection), times payments per year; also
  the effective annual rate. Cost of money = total repaid - cash received.
- Optional: payment as a share of monthly revenue, cash-flow cover, and an early-payoff month (loan balance plus any
  prepayment penalty; factor remainder less any discount).

## Limits

Not modelled: variable rates, balloons and interest-only periods, lines of credit, personal guarantees, collateral,
covenants, tax, any lender's real fee schedule. Verified only against textbook formulas and invented offers. Not legal,
tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
