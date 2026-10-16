# Shopify Discount Leakage Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/shopify-discount-leakage-analyzer/>

A free browser tool for small Shopify merchants: **drop in your orders export and
see, for every discount code, how much it gave away and what share of its orders
had to be new sales for the discount to pay for itself.** The file is read in the
browser; nothing is uploaded and no store access is needed.

After using this, you can now **rank your discount codes by what they really cost,
see which ones refund more than full-price orders, and find out how much discount
went to customers who had already bought**, which used to mean installing an
analytics app with access to your store or building the pivot table by hand.

## Input

The orders CSV from Shopify admin (Orders, Export). Needs `Name`, `Total` (or
`Subtotal`) and `Discount Code` or `Discount Amount`; `Email`, `Created at`,
`Refunded Amount`, `Cancelled at` and `Financial Status` are used when present.
Shopify writes one row per line item with order fields on the first row only;
orders are grouped by name and counted once. Cancelled and voided orders are
excluded and counted. Unreadable orders are listed with a line number and reason.

## Model

List price is subtotal plus discount. With margin `m = 1 - product cost - fee rate`
and a code discounting `d` of list price, the share of its orders that must be
incremental to break even is `d(1 - fee) / m`; above 100% the discount is deeper
than the margin and the code loses money whatever the mix. Repeat buyers are
matched by email inside the file, so the repeat share is a lower bound. See the
page for what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
