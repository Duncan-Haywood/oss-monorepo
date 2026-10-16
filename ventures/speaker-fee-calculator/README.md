# Speaker Fee Calculator

A free browser tool: **type the income you want from speaking, your overhead and expected bookings, and see the
keynote fee the year needs, a stacked quote with add-ons, a virtual price, and what each booking nets per hour.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/speaker-fee-calculator/

After using this, you can **set a keynote or workshop fee you can defend** instead of guessing from what
a peer once mentioned, and see whether raising the fee or booking more events gets you to the goal.

## Model

- Fee floor = ((income goal + overhead) / bookings per year, plus travel when you pay it) / (1 - average
  commission). Average commission = bureau rate x share of bookings through a bureau.
- Quote = base fee, plus custom content (% of base), workshop (flat), recording rights (% of base), rush
  (% of subtotal). Virtual discounts the base and removes travel time and cost.
- Net per hour = fee - commission - travel you pay, divided by prep + event + travel-day hours.
- Ladder: bookings and hours per year needed at 60%-200% of today's fee, flagged against a 2,000-hour year.

Defaults are placeholders, not market rates. Not modelled: taxes, contract terms, cancellation fees.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
