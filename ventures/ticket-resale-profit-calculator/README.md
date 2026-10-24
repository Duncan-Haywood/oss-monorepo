# Ticket Resale Profit Calculator

What do you actually take home when you resell tickets? Price one listing (net payout, break-even and
target-profit list price, the same order on StubHub / SeatGeek / Vivid Seats / Ticketmaster, and expected
profit once some listings do not sell), or audit a log of past sales by marketplace. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ticket-resale-profit-calculator/

```
node cli.mjs price --cost 120 --qty 2 --list 150 --p-sell 0.8
node cli.mjs price --cost 120 --qty 2 --target-profit 100 --fee 15
node cli.mjs log sales.csv --min-roi 10
cat sales.csv | node cli.mjs log -
```

## What is arithmetic and what is an assumption

Arithmetic: payout, profit, ROI, break-even list price, effective fee rate. Assumptions you set: the chance a
listing sells and what an unsold ticket is worth. Fee presets (about 10% / 10% / 10% / 15%) are typical seller
rates as last checked; marketplaces change them, so overwrite them with what your listing screen shows. Buyer
fees, tax and chargebacks are not modelled.
