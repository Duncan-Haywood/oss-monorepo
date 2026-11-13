# Ticket Resale Profit Calculator

What do you actually take home when you resell tickets? Price one listing (net payout, break-even and
target-profit list price, the same order on StubHub / SeatGeek / Vivid Seats / Ticketmaster, and expected
profit once some listings do not sell), or audit a log of past sales by marketplace. Browser page or
zero-dependency CLI.

**Live tool:** https://marisstella.app/ticket-resale-profit-calculator/

```
node cli.mjs price --cost 120 --qty 2 --list 150 --p-sell 0.8
node cli.mjs price --cost 120 --qty 2 --target-profit 100 --fee 15
node cli.mjs log sales.csv --min-roi 10
cat sales.csv | node cli.mjs log -
```

## What is arithmetic and what is an assumption

Arithmetic: payout, profit, ROI, break-even list price, effective fee rate. Assumptions you set: the chance a
listing sells and what an unsold ticket is worth. Fee presets (about 10% / 10% / 10% / 15%) are typical seller
rough typical rates, not taken from a dated fee page; marketplaces change them, so overwrite them with what your listing screen shows. Buyer
fees, tax and chargebacks are not modelled.

## Known gaps (quality audit round 62)

From [`portfolio/quality/audits/2026-11-13-ticket-resale-profit-calculator.json`](../../portfolio/quality/audits/2026-11-13-ticket-resale-profit-calculator.json):

- Sales-log headers are matched by prefix, so an extra column such as `Purchase Date` can take the cost slot (and `Sold On` the sale slot) and leave the log unreadable. Needs whole-name matching with one column per field.
- The cost box does not say whether buy-side fees belong in it; a broker's cost basis includes them.
- A blank fee box is read as 0%, and selling part of an order is not modelled.
- Fixed in round 62: an unquoted `$1,200.00` no longer shifts a sales row's columns (the row is skipped and counted), and tests now pin break-even with per-ticket fees, the salvage value of unsold tickets and the losing-sales filter.

