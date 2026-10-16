# Gabor-Granger Price Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/gabor-granger-price-analyzer/>

A free browser tool for founders, product managers and pricing consultants: **paste the highest price each
survey respondent said they would buy at and see the demand curve, the revenue-maximising price, the
profit-maximising price for a unit cost you enter, price elasticity between tested prices and a bootstrap
band on the best price.** Nothing is uploaded.

After using this, you can now **rank the prices you tested by revenue and profit and see how often a
different sample would have picked a different one**.

## Model

- Demand at price p: share of all respondents (refusers included) whose highest accepted price is at least p.
- Revenue per respondent: p x demand. Profit per respondent: (p - unit cost) x demand.
- The best price is always a tested price (demand is a step function); ties go to the lower price.
- Arc elasticity between adjacent tested prices.
- Bands: percentile bootstrap, 300 resamples of respondents with replacement, fixed seed; also the modal
  winner and the share of resamples it won.

Not modelled: competitors, discounts, churn, purchase frequency, sample bias. Stated willingness to pay
overstates real purchases.

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
