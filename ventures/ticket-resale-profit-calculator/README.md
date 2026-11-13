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
rates as last checked; marketplaces change them, so overwrite them with what your listing screen shows. Buyer
fees, tax and chargebacks are not modelled.

## Known gaps (quality audit 2026-11-13)

From [`portfolio/quality/audits/2026-11-13-ticket-resale-profit-calculator.json`](../../portfolio/quality/audits/2026-11-13-ticket-resale-profit-calculator.json);
the sales-log header, per-ticket cost and blank-fees defects were fixed in the same PR.

- The fee presets (10% StubHub, SeatGeek, Vivid Seats; 15% Ticketmaster resale)
  carry no source or date in the code. They fall inside third-party 2025
  ranges, but no marketplace's own fee schedule has been checked; type the
  rate your listing screen shows.
