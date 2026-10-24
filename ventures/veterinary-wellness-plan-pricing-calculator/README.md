# Veterinary Wellness Plan Pricing Calculator

A free browser tool for veterinary practices: **list the services in an in-house wellness plan and see the monthly fee that reaches your target margin**, what happens to margin if members use more of the bundle than planned, what members save, and what the plan earns across your member base after churn.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/veterinary-wellness-plan-pricing-calculator/

After using this, you can **set a plan price from your own costs and a utilisation assumption instead of copying a competitor's number**, and see how much room there is before heavy users turn it into a loss.

## Model

Per member-year: list value = sum of quantity x list price; the member pays 12 x monthly fee. Service cost = sum of quantity x your cost x share of the bundle used. Billing fees = payments x fee rate. Margin = payments - fees - service cost. The fee for a target margin is service cost / (1 - fee rate - target) / 12. Break-even use = (payments - fees) / full bundle cost. Across members: margin x members less sign-up cost x members who leave.

Not modelled: extra visits and retention a plan may bring, tax treatment of prepaid revenue, state rules on pet wellness plans, clinical appropriateness of bundled services.

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
