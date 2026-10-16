# Wedding Venue Date Pricing Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wedding-venue-date-pricing-optimizer/>

A free browser tool for wedding venue owners: **for each kind of date (peak Saturday, off-peak Saturday, Friday or Sunday, weekday), type the dates you have, today's price, bookings, turned-away enquiries and price sensitivity, and get the price that earns the most after the cost of hosting.** It shows expected bookings, flags date types that still sell out, and stress-tests the answer if your price-sensitivity guess is off by 30%. Nothing is uploaded.

After using this, you can **raise the price of dates you keep selling out and stop over-pricing the dates that sit empty**, with a number behind each change.

## Model

- Demand for a date type is constant-elasticity, anchored on today: bookings plus turned-away enquiries at today's price, falling by *e* percent per 1 percent price rise, capped at the dates available.
- Contribution = bookings x (price - cost to host). Rent and salaries are fixed and ignored.
- The best price is exact: it is the price that just fills the calendar, the unconstrained optimum cost x e/(e-1), or an end of your allowed range, whichever earns most. Tests cross-check against a brute-force price scan.

Not modelled: shifting between date types, competitor response, add-ons, deposits, cancellations, seasonality inside a type.

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

