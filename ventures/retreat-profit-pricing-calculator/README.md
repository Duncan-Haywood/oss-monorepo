# Retreat & Workshop Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/retreat-profit-pricing-calculator/>

A free browser tool for yoga teachers, coaches and trip organizers who book a venue months ahead: **type your costs, prices and expected guests and see profit, the break-even number of paying guests, what a venue guaranteed minimum costs you, what an early-bird tier gives up, and the regular price that hits a profit target.**

After using this, you can **know how many guests a retreat needs and what to charge before you sign the venue**, which used to be a spreadsheet and a guess.

## Model

- Ticket revenue: the first N seats sell at the early-bird price, the rest at the regular price.
- Card and platform fees are a percentage of ticket revenue.
- Lodging and meals cost nights x per-person-per-night for every person the venue bills: the larger of (paying guests + free staff spots) and the guaranteed minimum.
- Fixed costs: venue or space, instructors, marketing, insurance, your travel, everything else.
- Profit = revenue - card fees - lodging and meals - fixed costs.
- Break-even is the smallest number of paying guests (up to seats for sale) whose profit is not negative.
- The profit-target price solves for the regular price that gives the target at the expected turnout.
- The tables re-run profit from 40% to 100% of seats for sale and at regular prices 20% under to 20% over.

Not modelled: sales tax or VAT, income tax, refunds and cancellations, installment payments and deposit timing, currency, room-type pricing, and add-ons. Costs and turnout are your inputs, not predictions.

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
