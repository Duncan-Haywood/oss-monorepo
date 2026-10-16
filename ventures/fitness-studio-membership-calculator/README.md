# Fitness Studio Membership Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fitness-studio-membership-calculator/>

A free browser tool for boutique gym, yoga, pilates and CrossFit owners: **type your members, price, churn, joins and costs and see what a member is worth**, what it costs to win one, how fast they pay it back, where the member count settles, how many members cover fixed costs, class-capacity utilization, and what a point of churn or $10 of price is worth.

After using this, you can **decide whether to spend the next dollar on ads or on retention**, which used to be a gut call.

## Model

Contribution per member-month = `price - (price x card% + fixed fee) - variable cost`. Lifetime = `100 / churn%` months. LTV = contribution x lifetime (undiscounted, contribution not revenue). CAC = marketing spend / new members. Payback = CAC / contribution. Each projected month: `members = members x (1 - churn) + joins`; profit = members x contribution - fixed - marketing. Steady state = joins / churn. Capacity = classes/week x 52/12 x spots; utilization = members x visits / capacity. Scenarios re-run the projection with churn +/-1 point, price +$10 and +5 joins a month.

Not modelled: seasonality, churn that varies by tenure, discounting, intro-offer cohorts, tiers, retail, personal training, taxes.

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
