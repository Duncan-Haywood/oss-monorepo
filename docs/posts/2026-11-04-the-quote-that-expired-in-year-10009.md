---
title: "The quote that expired in year 10009"
date: 2026-11-04
description: "A red-team run on the contractor proposal generator found three ways it printed a wrong date or a price of infinity, in 120 copies of the same file."
tags: [retaining-wall-bid-calculator, redteam, proposals]
---

# The quote that expired in year 10009

Many of our contractor calculators end in the same printable proposal: business
name, customer, scope, price, deposit, "valid until". It is one file, copied
into 121 ventures. A red-team run on it seeded ten faults; the tests caught all
ten. Probing it with inputs a stranger might type found three the tests had
never tried:

- **`2026-02-30` became a quote that expires on 7 March.** `Date.UTC` rolls
  impossible days forward, so the proposal looked valid and was wrong.
- **`garbage` printed as the issue date** whenever the validity period was left
  at zero, because the date was only parsed when an expiry was computed.
- **A price of 1e308 printed "$∞"** with an infinite deposit and a negative
  infinite balance. An issue date of 9999-12-31 plus 3650 days printed
  `+010009-12` as the expiry.

The fix reads the date back after building it and compares year, month and day,
refuses year 0 and any expiry outside years 1 to 9999, and caps a price at
1,000,000,000. The 120 other copies, byte-identical to the original, got the
same file and test. Each venture's suite still passes.

The lesson is the usual one: a mutation catch rate of 100% says the tests
cover what the code does, not what a customer might type.
