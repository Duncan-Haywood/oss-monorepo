# Customer Lifetime Value Predictor

A free browser tool for online shops, DTC brands and any business where customers come back at irregular times:
**drop in an order export (customer, date, amount) and get a predicted lifetime value for every customer.** It fits
the BG/NBD and Gamma-Gamma models to your own data, reports the probability each customer is still active, lists
big spenders who look ready to leave, values a brand-new customer (the ceiling on what to pay to acquire one), and
back-tests itself against your most recent weeks so you can see how far to trust it. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/customer-lifetime-value-predictor/

After using this, you can now **see which customers are worth winning back, stop spending on ones who have left,
and know what a new customer is worth before you buy one**.

## Model

- Per customer: repeat purchase days `x`, weeks from first to last purchase `tx`, weeks from first purchase to the
  end of the data `T`, and mean repeat order value. Orders on one day count as one purchase; refunds are dropped.
- BG/NBD (Fader, Hardie & Lee 2005): four parameters fitted by maximum likelihood (Nelder-Mead in log space) on
  grouped customers. Probability still active and conditional expected purchases use the published closed forms
  (Gauss hypergeometric series).
- Gamma-Gamma (Fader & Hardie 2013): shrinks each customer's average repeat order toward the population.
- Value: monthly expected purchases x predicted order value x margin, discounted. Horizon 6 to 36 months.
- Back-test: refit on data ending 8 to 26 weeks before the last order, predict those weeks, compare, total and by
  repeat-count bucket.
- Checked in unit tests by parameter recovery on simulated data, prediction against a simulated holdout (0.2% off
  with true parameters), and closed-form identities for the special functions.

Not modelled: subscriptions with fixed billing, one-off purchases, seasonality, promotions, returns, customers who
pause and return, frequency-spend correlation (warned about). Unverified against a published customer dataset.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of e-commerce platforms and analytics vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `file_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
