# Commercial Solar: Buy vs PPA vs Lease Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/commercial-solar-ppa-lease-buy-calculator/>

A free browser tool for businesses, farms, nonprofits and landlords: **type a purchase quote, a PPA quote and a lease quote and see them on the same after-tax cash flows**, with NPV, payback, IRR on buying, the PPA rate at which buying stops winning, and a sensitivity to utility rate escalation.

After using this, you can **tell which of three commercial solar quotes is worth more to you and what an installer would have to price a PPA at to beat buying**, which used to be a spreadsheet the installer built for you.

## Model

All options are measured against doing nothing (paying the utility). Year `y` production is `kW x yield x (1 - degradation)^(y-1)`; avoided cost is production x utility rate escalated at the rate you enter.

- **Buy**: price minus an upfront rebate, optionally financed with a level-payment loan. Operations and maintenance (grows 2% a year), an inverter replacement in year 12, the tax credit (year 1, reduces the depreciable basis by half the credit) and optional 5-year MACRS depreciation. Savings and costs are taxed at your rate; a tax rate of 0 ignores the credit and depreciation.
- **PPA**: you pay production x a starting rate that escalates; the provider owns the system and the credits.
- **Lease**: 12 monthly payments a year, escalating; same ownership assumption.
- After a PPA or lease term shorter than the analysis, you buy the system out at a percentage of installed cost and run it yourself (O&M applies, no depreciation).
- NPV discounts each year's cash flow at your rate. The break-even PPA rate is found by bisection against the buy NPV. The sensitivity table re-runs the whole comparison at 0, 2, 4 and 6% utility escalation.

Not modelled: net-metering and demand-charge structure (enter a blended $/kWh), battery storage, SRECs, state tax, bonus depreciation, direct-pay credits for tax-exempt owners, fair-market-value buyouts, and fees. Credit percentages are inputs, not rulings.

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
