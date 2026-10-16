# Solar Payback Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/solar-payback-calculator/>

A free browser tool for homeowners weighing a solar quote: **enter system size, cost, incentives, production
and your electricity price and export credit, and see the payback year, 25-year net gain, NPV and IRR, and
how the answer moves under net billing, slower price increases or lower production.** Nothing is uploaded.

After using this, you can now **see whether a quote still pays back if your utility credits exports at a
fraction of the retail price**, which used to take a spreadsheet you had to build and trust yourself.

## Model

- Production = kW x yearly kWh per kW, falling by the degradation rate each year.
- Yearly savings = production x self-used share x import price + production x remainder x export credit,
  both prices rising by the yearly increase. Costs: maintenance, one inverter replacement, loan payments.
- Outlay = cost - incentives - loan. Payback interpolates the year cumulative cash flow turns positive.
  NPV uses the discount rate; IRR is found by bisection.

Not modelled: batteries, time-of-use and demand charges, utility fixed fees, taxes, home value, shading,
changing export rules. Incentives are a dollar amount the visitor enters; the tool asserts no incentive rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of solar installers, manufacturers, lenders and utilities; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`payback_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
