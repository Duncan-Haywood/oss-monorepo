# EV Charging Site ROI Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ev-charging-site-roi-calculator/>

A free browser tool for property owners, fleet managers and charging operators: **type the ports, costs, price and expected utilization of a Level 2 or DC fast charging site and get payback, NPV and IRR, plus the sessions per port per day and the price per kWh that break even.** It shows how much of revenue the utility's demand charge takes and how NPV moves with utilization, price and demand rate. Nothing is uploaded.

After using this, you can **see whether a quote only works at a utilization you will not reach, and what to negotiate (price, demand rate, power cap, incentives) to fix it**, which a vendor's cost-only calculator does not show.

## Model

- Sessions = ports x sessions per port per day x 365, ramping linearly from a year-1 share to mature utilization. kWh = sessions x kWh per session.
- Revenue = kWh x price. Costs: energy, demand charge (rate x billed peak kW x 12; peak = ports x kW x simultaneity, optionally capped), card fees, host share, network fees, maintenance (% of hardware), other fixed.
- Price rises and energy/demand costs rise by the yearly percentages you set. Cash flows are pre-tax, with nothing left at the end.
- Payback is cumulative undiscounted cash, interpolated; NPV at your discount rate; IRR by bisection; break-even utilization and price by bisection on NPV.

Not modelled: taxes, depreciation, financing, tariff ratchets and time-of-use, grid capacity, failures, credits, advertising.

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
