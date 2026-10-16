# Usage-Based Pricing Simulator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/usage-based-pricing-simulator/>

A free browser tool for SaaS, API and infrastructure founders setting metered prices: **describe up to three
plans (platform fee, included units, overage price, volume tier) and your customers' usage, and see revenue,
margin, bill shock, customers who cost you money, what happens if customers pick the cheapest plan, and revenue
as usage grows.** Nothing is uploaded.

After using this, you can now **see what a pricing shape earns from your own skewed customer base before you
publish it**, which used to take a spreadsheet per plan and a guess about how customers would choose.

## Model

- Monthly bill = platform fee + first price x units above the included allowance (up to the volume breakpoint)
  + second price x units above the breakpoint. Graduated, so bills never fall as usage rises.
- Usage is a pasted list of per-customer usage, or a lognormal curve fitted to the median and the
  90th-percentile-to-median ratio, evaluated at 1,000 fixed quantiles (deterministic, no random sampling).
- Revenue = sum of bills; cost = units x cost per unit; margin = the difference.
- "Cheapest plan" gives each customer the lowest bill across the plans entered (revenue lost to self-selection).
- Growth table multiplies every customer's usage by 0.5, 1, 2 and 5 with prices held constant.

Not modelled: churn and demand response to price, discounts and commitments, free tiers, taxes and payment fees.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of billing platforms, payment processors and pricing vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`simulation_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
