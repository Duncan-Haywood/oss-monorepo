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
- Cohorts (`cohortRetention`, shown on the page and in the CLI): customers grouped by month of first order, with the share who bought again within 30, 90, 180 and 365 days and revenue per customer in each window. A window is blank until every customer in the cohort has been observable that long.
- Back-test: refit on data ending 8 to 26 weeks before the last order, predict those weeks, compare, total and by
  repeat-count bucket.
- Acquisition payback (`paybackCurve`, `--cac` in the CLI, an optional box on the page): type what you pay to win a customer and it shows the month the new-customer running total passes it, the value-to-cost ratio over your horizon, and the most you can pay for a 3:1 return.
- Checked in unit tests by parameter recovery on simulated data, prediction against a simulated holdout (0.2% off
  with true parameters), and closed-form identities for the special functions.

Not modelled: subscriptions with fixed billing, one-off purchases, seasonality, promotions, returns, customers who
pause and return, frequency-spend correlation (warned about). Unverified against a published customer dataset.

## Alternatives, and what this does differently

Today a shop owner gets lifetime value from a paid retention platform's dashboard (Klaviyo, Triple Whale, Lifetimely
and similar), from a data-science consultant, or from an "average order value x orders per year x years" spreadsheet
guess. The dashboards need your store connected to a vendor and charge by order volume; the spreadsheet cannot tell
a lapsed customer from a slow one. This tool fits the published BG/NBD and Gamma-Gamma models to an order export on
your own machine, so each customer gets a probability of still being active and a value, and it back-tests itself on
your recent weeks so you can see how far to trust it. It does not connect to your store, build audiences or send email.

## Run

Open `index.html` through any static server. Tests: `node --test`.

**Command line** (Node 18+, no install, nothing sent anywhere):

```
node cli.mjs orders.csv                          # summary, segments, findings, top 10 customers
node cli.mjs --horizon 24 --margin 40 orders.csv # 24-month value at a 40% margin
node cli.mjs --csv orders.csv > clv.csv          # one row per customer, for a spreadsheet or a win-back list
node cli.mjs --segment "At risk, high spend" --csv orders.csv
node cli.mjs --json orders.csv                   # full analysis for scripts
node cli.mjs --example                           # try it on synthetic data
```

Run the `--csv` form after each month's export to refresh the list of high-spend customers who look ready to leave.

## Host your own copy

Your data stays in the browser, but you can serve the page from an address you control. It is a static site: the
server only hands out files and never sees what you load.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.

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
