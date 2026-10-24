# Van Westendorp Pricing Analyzer

A free browser tool for founders, product managers and pricing consultants: **paste the answers from a
four-question price survey (too cheap, cheap, expensive, too expensive) and see the range of acceptable
prices, the optimal price point, the indifference price, a chart of the four curves and a bootstrap band
around each point.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/van-westendorp-pricing-analyzer/

After using this, you can now **see the price range your survey respondents accept and how much a small
sample could move it, before you set a price or run a live test**.

## Model

- Curves: too cheap and cheap are the share of respondents whose answer is at or above the price; expensive
  and too expensive are the share whose answer is at or below it.
- Points: marginal cheapness (too cheap x not cheap), marginal expensiveness (too expensive x not
  expensive), optimal price (too cheap x too expensive), indifference price (cheap x expensive). Linear
  interpolation between survey prices; first crossing from the left.
- Rows whose four prices do not rise in order, or that are not positive, are dropped and counted.
- Bands: percentile bootstrap, 300 resamples of respondents with replacement, fixed seed.

Not modelled: purchase intent, demand, revenue, competitors, segments. It measures stated price perception,
not willingness to pay.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of survey platforms and pricing consultancies; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
