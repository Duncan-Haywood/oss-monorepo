# Pottery Piece Pricing Calculator

A free browser tool for potters who sell. Enter clay, glaze, kiln loads,
breakage, your hours and studio rent. It shows the true cost of a *sellable*
piece, the retail and wholesale price that reaches your target margin, your
hourly return, and how breakage, half-empty kilns and electricity prices move
it. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pottery-piece-pricing-calculator/

After using this, you can **see what a mug really costs and what to charge for
it**, including the firings and the pieces that never sell.

## Try it

Open [`index.html`](index.html) and click **Price my pottery**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Each made piece costs
clay, glaze, a share of a bisque and a glaze firing (kWh x rate + wear, divided
by pieces in the load), your minutes at your hourly value, and a share of
monthly studio cost. Lost pieces are paid for in full, so cost is divided by the
fraction that survives. Price for a margin is cost / (1 - margin - fees).

## What this does not cover

Sales tax, licensing, insurance, demand in your market, tax on craft income.
Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
