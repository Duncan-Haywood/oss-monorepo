# Bundle Discount Optimizer

A free browser tool for Shopify, Etsy, Amazon and other small online sellers: **paste your order history and product
costs, and see which pairs of products customers already buy together, the bundle discount that earns the most, and
the break-even** &mdash; how much more often shoppers must add the second item before the discount stops losing money.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bundle-discount-optimizer/

After using this, you can now **pick the two or three bundles worth running and know the discount that pays for itself**,
which used to be a guess on a "frequently bought together" app.

## Model

- Products: `sku, price, unit cost`. Orders: one line per item, `order id, sku`, oldest first. Quantity is ignored.
- Pairs: every two products in at least N orders (default 3). Loss: each order already holding both pays the discount on
  the combined price, net of the percentage fee. Gain: a discount raises how often buyers of one item add the other,
  by a fraction of the attach rate already observed (orders with both / orders with that item), so a pair nobody buys
  together gains nothing. Each added item is sold at the bundle price, less fee, unit cost and handling.
- The response to a discount is an **assumption** ("extra attach at a 10% discount", default 40%, growing with the square
  root of the discount); past orders contain no discounted bundle and cannot measure it. The tool therefore also
  reports the break-even attach rise and profit at 5, 10, 15 and 20% off.
- Best discount: highest estimated profit change from 1% to the limit. Hold-out: newest 30% of orders; the pairing
  must appear at at least half its earlier rate. Range: 300 seeded bootstrap resamples (10th-90th percentile). "Try" needs
  a positive estimate, a pairing that holds up, a positive low end, 10+ paired orders and a break-even under half the
  assumed response.

## Limits

Not modelled: shipping revenue, taxes, returns, stock limits, discount-only customers, bundles of three or more,
overlapping promotions, seasonality. Verified only against hand calculations, brute-force counting and invented data.
Not legal, tax, or financial advice.

## Run

Open `index.html`, or `node --test` to run the tests. No build step, no dependencies, no network calls.

## No warranty

Provided free and as-is, without warranty of any kind. Not legal, tax, or financial advice. MIT licensed.
