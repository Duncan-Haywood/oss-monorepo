# SaaS Tier Price Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/saas-tier-price-optimizer/>

A free browser tool for SaaS founders: **paste what each surveyed customer would pay per month for each plan, and get the Good-Better-Best prices that earn the most profit**, who lands on each plan, and what that is worth against your current prices.

After using this, you can **set a three-plan price ladder from a willingness-to-pay survey in minutes**, which used to take a spreadsheet of guesses or a paid pricing consultant.

## Model

- Each respondent gives the most they would pay per month for each plan (blank or `-` = would not buy it) and optionally a weight.
- A respondent buys the plan with the largest surplus (their maximum price minus the price); a tie goes to the higher-priced plan; nobody buys at negative surplus.
- Prices form a ladder (each plan costs at least the one below) and never fall below the cost to serve.
- Profit = sum over buyers of `price - cost`. The search tries a grid of surveyed prices (thinned to 36 per plan), then slides each price to its exact best value in turn (profit only changes where a respondent switches plan, so only those prices need testing). Tests compare it with exhaustive search over surveyed prices on random surveys and check no single price move improves the answer.
- Sensitivity: profit change when each price moves 10% either way. The baseline "best single plan" shows whether a ladder is worth having.

Not modelled: features, annual billing, trials, free tiers, churn and lifetime value, competitors, stated-versus-real willingness to pay (stated prices usually run high; test the top candidate on real signups).

Up to 3 plans and 2,000 survey lines.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
