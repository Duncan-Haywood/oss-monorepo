# Bandcamp Sales Report Analyzer

A free browser tool for Bandcamp artists and labels: **drop in your sales report CSV and see
what the fees actually took and what each release and format nets you.** The file is read
in the browser; nothing is uploaded and no Bandcamp login is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bandcamp-sales-report-analyzer/

After using this, you can now **see fees paid and the fee rate, net by item type, release,
month and country, the fee drag on small sales, vinyl and merch profit after your own unit
cost and postage with a break-even price, refunds, discount-code share and repeat buyers**,
which used to mean building pivot tables from the report by hand.

## Input

A sales report CSV with a `date` column and at least one of `net amount`, `sub total` or
`item price`. `item type`, `item name`, `quantity`, `shipping`, `seller tax`,
`marketplace tax`, `transaction fee`, `currency`, `country`, `discount code`,
`additional fan contribution` and `buyer email` are used when present. **Column names are
matched by alias from memory of Bandcamp sales reports; no real export was available.**
Buyer emails and names are turned into an anonymous number to count repeat buyers and are
not kept.

## Model

Net is the file's net amount, or sales plus shipping minus the transaction fee when that
column is missing. Refund rows are counted apart. Only the main currency in the file is
analysed; no exchange rates are applied. Physical profit uses the unit cost and postage
you type. Groups under five sales are shown but never drive a suggestion. See the page for
what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
