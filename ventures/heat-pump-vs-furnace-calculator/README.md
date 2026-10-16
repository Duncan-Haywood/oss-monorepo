# Heat Pump vs Furnace Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/heat-pump-vs-furnace-calculator/>

A free browser tool for homeowners replacing a furnace: **enter your gas use, your gas and electricity prices,
the heat pump's COP and the two quotes, and see the heating cost per million BTU, the break-even COP, payback
against a new furnace and AC, and the lifetime difference.** Nothing is uploaded.

After using this, you can now **see the seasonal COP at which a heat pump costs the same to run as your gas
furnace on your own prices**, which used to take a spreadsheet and a therm-to-kWh conversion.

## Model

- Heat delivered = therms x 29.3071 kWh x AFUE. Heat pump electricity = heat delivered / COP.
- Gas system yearly cost = therms x gas price (+ connection fee + a new AC's cooling electricity + maintenance);
  heat pump = heating electricity + cooling electricity less the saving + maintenance. Prices escalate yearly.
- Extra up-front cash = heat pump quote + extra work - incentives - (new furnace + new AC). Payback interpolates
  the year the cumulative difference turns positive. NPV discounts at the rate entered; IRR is by bisection.
- Break-even COP = delivered heat x electricity price / yearly gas heating cost.

Not modelled: time-of-use and demand charges, taxes, home value, comfort, COP that varies with outdoor
temperature. Incentives are a dollar amount the visitor enters; the tool asserts no incentive rules.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of HVAC contractors, manufacturers, lenders and utilities; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
