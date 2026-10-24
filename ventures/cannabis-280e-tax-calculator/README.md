# Cannabis 280E Tax Calculator

Estimate what IRC section 280E costs a cannabis business: tax on **gross profit** versus tax on
**real profit**, the extra tax, whether tax is owed on a real loss, how tax moves with operating
expenses, and what a cost-of-goods-sold reclassification would be worth per $1,000.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cannabis-280e-tax-calculator/

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no network
calls. [`280e-vs-ordinary-business-tax-comparison.html`](280e-vs-ordinary-business-tax-comparison.html)
walks one worked example. Rates are the visitor's own assumptions; this is an estimator, not tax advice.

## CLI

```
node cli.mjs --receipts 2400000 --cogs 1300000 --opex 780000 --fed 21 --state 7
node cli.mjs --receipts 2400000 --cogs 1300000 --opex 780000 --no-280e
```

Tests: `node --test tax.test.mjs page.test.mjs`. MIT licence.
