# Rent vs Buy Break-Even Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rent-vs-buy-breakeven-calculator/>

A free browser tool: **type a house and a comparable rental and see the year buying pulls ahead, the
net-worth gap at the year you plan to move, and the starting rent at which renting and buying are exactly
level.** A sensitivity grid shows how far home-price growth and investment return move the answer. Nothing
is uploaded.

After using this, you can **know how long you need to stay and what rent makes buying worthwhile** instead
of comparing a mortgage payment with a rent number.

## Model

- Same total monthly housing spend for both households. The renter invests the down payment and closing
  costs on day one and every month's difference (owning cost minus rent), compounding monthly from the
  after-tax annual return typed.
- Buyer monthly cost: level fixed-rate loan payment, property tax, insurance and maintenance (each a % of the
  current home value), HOA, PMI on the original loan while the balance is above 80% of the price, minus the
  tax saving.
- Tax saving = max(0, mortgage interest + property tax up to the cap + other itemized - standard deduction)
  x marginal rate, per year. A buyer who would not itemize gets nothing.
- Year-end net worth: buyer = home value x (1 - selling cost %) - loan balance; renter = investment account.
- Break-even year = first year buyer is ahead. Break-even rent = bisection on the starting rent so the
  advantage at the horizon is zero.

Not modelled: moving costs, refinancing, extra payments, capital-gains tax on the sale, tax on the renter's
gains beyond the typed return, rent control, local market cycles.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
