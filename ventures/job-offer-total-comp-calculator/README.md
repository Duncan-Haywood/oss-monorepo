# Job Offer Total Compensation Calculator

A free browser tool for anyone weighing job offers: **enter up to three offers and see each one's
four-year average pay (equity cut to a confidence you choose), its true hourly rate after commute and time
off, and the base salary you would need to counter with to match the best offer.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/job-offer-total-comp-calculator/

After using this, you can now **compare an equity-heavy startup offer with a higher-cash one on the same
footing**, which used to take a spreadsheet you had to build and trust yourself.

## Model

- Yearly total = base + target bonus + retirement match (capped) + other benefits + sign-on (year 1 only) +
  equity (even yearly vesting slices, grown by a yearly rate, times confidence) + refresh grant from year 2.
- Comparison = average of years 1 to 4. After-tax view uses one flat rate.
- True hourly = average yearly total / ((52 - paid days off / 5) x (weekly hours + commute hours)).
- Counteroffer base = bisection for the base that lifts an offer's four-year average to the best offer's.

Not modelled: real taxes, equity tax at vest, health insurance, cost of living, cliffs, option strike prices.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of employers, recruiters and equity plan administrators.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`offer_compared`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
