# Real Estate Photographer Shoot Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/real-estate-photographer-shoot-profit-calculator/>

A free browser tool for real estate photographers: enter your package fees, shoot times, drive, editing
and add-ons and see the **true hourly earnings of each package tier**, the fee that reaches your hourly
target, what drone, twilight and floor-plan add-ons add, whether outsourcing editing frees time worth
more than it costs, and your month at your tier mix. Nothing is uploaded.

## Model

- Hours worked = round-trip drive + on-site + editing (own time) + admin, plus add-on time at your take rates.
- Profit = package fee + expected add-on fees - mileage - gear - outsourced editing - add-on cost - card fees.
- Per hour = profit / all hours worked. Fee for target = the package fee that earns your target per hour.
- Edit vs outsource = own editing minutes per photo priced at your target rate vs the service price per photo.

Not modelled: income and self-employment tax, rush fees, reshoots, MLS licensing, surcharges, second shooters.
The example numbers are illustrative, not a benchmark. Not legal, tax or financial advice.

## Run

Open `index.html` in a browser. Tests: `node --test`. MIT licensed; no secrets, no accounts, no network calls.
