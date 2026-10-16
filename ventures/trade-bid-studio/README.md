# Trade Bid Studio

A free, private browser tool for contractors in any trade. Enter labor hours,
burden, materials, subs and overhead; get the price that keeps your target
margin, the **walk-away price** below which the job loses money, the labor
slip that erases your profit, and what a competitor's lower quote leaves you.
It also converts markup to margin (25% markup is only a 20% margin).

It is also the single front door to the portfolio's 121 trade-specific
`*-bid-calculator` ventures: `trades.json` is generated from them
(`node build-directory.mjs`) and a test fails if it goes stale. This is the
"consolidate" step from `docs/reports/2026-10-16-calculator-glut.md`: one
discoverable product instead of 121 separate pages, with every old URL kept.

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
