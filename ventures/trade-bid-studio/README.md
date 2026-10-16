# Trade Bid Studio

A free, private browser tool for contractors in any trade. Enter labor hours,
burden, materials, subs and overhead; get the price that keeps your target
margin, the **walk-away price** below which the job loses money, the labor
slip that erases your profit, and what a competitor's lower quote leaves you.
It also converts markup to margin (25% markup is only a 20% margin).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/trade-bid-studio/

It is also the single front door to the portfolio's 121 trade-specific
`*-bid-calculator` ventures: `trades.json` is generated from them
(`node build-directory.mjs`) and a test fails if it goes stale. This is the
"consolidate" step from `docs/reports/2026-10-16-calculator-glut.md`: one
discoverable product instead of 121 separate pages, with every old URL kept.

## Start from your trade

Pick a trade and the studio fills in a **line-item takeoff** for that trade:
each line is quantity x crew hours per unit and quantity x materials per unit,
plus crew size, setup, a minimum on-site charge and drive time. The totals
become the labor hours and materials the bid engine prices, and the wage,
burden, overhead and margin defaults come along too. Every figure is editable.

The starting rates are not invented here. Each trade's preset in
[`presets/`](presets/) is taken from that trade's own `*-bid-calculator` (its
production rates, coverage and default prices), and every line records where
its numbers came from (`source`). That makes the 119 trade calculators one
product with a shared engine and the trades as data, the consolidation
`docs/reports/2026-10-16-calculator-glut.md` asked for. The specialist pages
stay up: each preset names what its specialist models beyond line items
(condition multipliers, pitch factors, disposal tiers, printed proposals) and
the studio links there. Deep link to a trade with `#trade=<id>`, e.g.
`#trade=asphalt-sealcoat`.

`liquidation-pallet` and `storage-auction-max` have no preset on purpose: they
work out the most to pay at an auction, not a price to quote a customer.

```bash
node build-presets.mjs          # presets/*.json -> presets.mjs (a test fails if stale)
```

Open [`index.html`](index.html) in a browser or serve the directory
statically. Zero dependencies, no network calls beyond loading `trades.json`.

```bash
cd ventures/trade-bid-studio && node --test
```

After using this, you can now **price a job from cost to a margin-safe quote and
know your walk-away number**, which used to be a markup guess that
under-priced every job.

MIT licensed ([`LICENSE`](LICENSE)). No warranty: arithmetic from your own
inputs, not financial advice. Nothing leaves your browser.
