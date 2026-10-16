# Fix and Flip Deal Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fix-and-flip-deal-analyzer/>

A free browser tool for house flippers: **enter the after-repair value, purchase price, rehab budget and hard-money terms and see profit,
cash needed, return on cash, the maximum allowable offer for your target profit, the break-even sale price, and how profit moves with
sale price and time on the market.** Nothing is uploaded.

After using this, you can now **tell the most you can pay for a flip and still hit your target profit once financing, holding and selling costs are counted**.

## Model

- Purchase loan outstanding for the whole hold; rehab loan drawn evenly across the rehab months; interest paid monthly; points on the total loan; contingency paid in cash.
- Profit = sale price - all costs (before income tax). Cash needed = costs before sale - loan principal.
- Maximum offer and break-even sale price are solved numerically against the same cost stack, and the 70% rule is shown for comparison.

Not modelled: income tax, state transfer taxes, draw fees, lender minimum-interest clauses, extension fees, market movement while held.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting every rule that applies to you.
