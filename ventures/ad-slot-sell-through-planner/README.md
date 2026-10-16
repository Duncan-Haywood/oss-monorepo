# Ad Slot Sell-Through Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ad-slot-sell-through-planner/>

A free browser tool for newsletter and podcast publishers who sell sponsorship
slots. Paste your last runs (label, slots offered, slots sold, price); it shows
sell-through and its trend, revenue left unsold, how your sales respond to
price, a recommended price move, whether the next run is on booking pace, and
what a last-minute floor or a multi-run package is worth. Entirely
client-side; nothing is uploaded.

After using this, you can now **tell whether to raise, hold or lower your
sponsorship price, and whether the next issue needs outreach now**, which used
to be a guess or a spreadsheet.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

All in [`calc.mjs`](calc.mjs), pure functions, no dependencies.

- `summarize`: sell-through, booked vs capacity revenue, recent-vs-prior trend.
- `fitElasticity`: log-log fit of sell-through on price over runs that neither
  sold out nor sold nothing (both are censored). Needs 4+ usable runs at 2+
  prices and a negative slope; otherwise an assumed -1.2, labelled as assumed.
- `recommend`: grid-search revenue per run under `rate = anchor * (p/p0)^e`
  capped at 100%, then limit the move to +/-25%. A sold-out anchor assumes
  15% excess demand.
- `pacing`: share of bookings normally in by N days out (interpolated), and a
  projected final fill.
- `lastMinute`, `packages`: plain arithmetic.

## What this does not cover

Audience quality, seasonality, renewals, make-goods, agency commissions, CPM
deals and tax. A planning aid, not a forecast or advice.

## License and privacy

MIT. Not legal, tax, or financial advice; no warranty. Nothing leaves your
browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
