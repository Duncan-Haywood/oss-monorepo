# Stump Grinding Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/stump-grinding-price-calculator/>

A free browser tool for stump grinding contractors. List the stump diameters on
a site; it estimates the wood to remove, cutting time at your grinder's real
speed, setup and drive, then prices the job for your overhead and target margin,
with a price for each stump, your minimum charge, and a check on your usual
per-inch quote. Entirely client-side.

After using this, you can **see whether a flat per-inch quote makes money on a
small job or a hard stump**, and what to charge instead.

## Try it

Open [`index.html`](index.html) and click **Price this job**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Volume per stump is
face area x (depth below grade + height above) x (1 + root allowance); cutting
minutes are volume / your cubic inches per minute x a hardness factor. On-site
time adds setup per job and positioning and cleanup per stump; the crew is paid
for the drive too. Price = direct cost / (1 - overhead - margin), floored at the
minimum charge. Setup and drive are shared equally across stumps in the
per-stump prices.

## What this does not cover

Utility locates (call 811), insurance, licensing, chip disposal, demand in your
market, tax. Planning arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
