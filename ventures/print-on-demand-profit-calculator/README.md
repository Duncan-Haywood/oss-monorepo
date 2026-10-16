# Print-on-Demand Profit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/print-on-demand-profit-calculator/>

A free browser tool for print-on-demand sellers: **type your price and what Printful, Printify or
Gelato charges you, and see what a sale actually leaves after marketplace fees.** Nothing is uploaded.

After using this, you can now **see profit per sale after Etsy, Shopify or eBay fees, refunds, ads
and samples, get the price that hits your target margin, know the most you can pay per sale in ads
(and the break-even ROAS), and see the same sale on the other platforms**, which used to mean a
spreadsheet you rebuilt every time a fee changed.

Related: [`etsy-profit-calculator`](../etsy-profit-calculator/),
[`shopify-fee-calculator`](../shopify-fee-calculator/),
[`ebay-fee-calculator`](../ebay-fee-calculator/),
[`marketplace-fee-compare`](../marketplace-fee-compare/).

## Input

Platform, selling price, shipping charged to the buyer, supplier item and shipping cost, refund
rate, ad spend and sample cost per sale, Etsy Offsite Ads share, a target margin, and optional
orders per month. Custom fee option for any other platform.

## Model

Fee percentages apply to the order total (price plus shipping charged) plus fixed per-order fees.
Presets are the author's recollection of US schedules as of 2026-09-29 and are **unverified**; every
one can be replaced. A refund returns revenue but not fees or the supplier's charge. The target
price is solved exactly. Not modelled: sales tax and VAT, currency, plan fees, tiered supplier
pricing, chargebacks, income tax. Not tax, legal or financial advice.

## Run

Open `index.html` through any static server. Tests: `node --test`.
