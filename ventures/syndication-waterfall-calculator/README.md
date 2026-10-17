# Syndication Waterfall Calculator

A free browser calculator for a real estate syndication distribution waterfall.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/syndication-waterfall-calculator/

After using this, you can now **see what LPs and the sponsor each earn under a
preferred return and tiered promote** — LP IRR and multiple, sponsor IRR, the
promote in dollars, tier by tier and year by year — which used to mean a paid
spreadsheet template.

## Try it

Open [`index.html`](index.html), click **Load an example**, then replace the
numbers with your own.

## What it calculates (`calc.mjs`, pure functions, no dependencies)

- `waterfall` — annual periods; every hurdle is an IRR on the whole investor
  class (LPs plus the sponsor's pari passu co-invest); each tier splits that
  tier's cash between the investor class and the sponsor promote.
- `irr` — bisection IRR on annual flows.
- `analyse` — parsing, input checks and plain-English findings.

## Limits, stated

Simplified: annual periods, compounding pref, no catch-up, no fees, no capital
calls, one investor class. The operating agreement controls real
distributions. Not securities, legal, tax or investment advice and not an
offer. The convention was written without review by a securities
professional. See the page.

## Tests

`node --test`
