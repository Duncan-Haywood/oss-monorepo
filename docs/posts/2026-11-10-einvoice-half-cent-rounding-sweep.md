---
title: "Half a cent: the same rounding bug in four more e-invoice files"
seo_title: "E-invoice VAT half-cent rounding bug: FA3, FatturaPA, UBL repair"
date: 2026-11-10
tags: [e-invoice, vat, rounding, open-source]
description: "Binary floats store 1.005 just under a half cent, so Math.round(x*100)/100 gives 1.00. A sweep of the e-invoice checker found it in four more places and fixed them."
---

In JavaScript, `1.005 * 100` is `100.49999999999999`, so
`Math.round(1.005 * 100) / 100` is `1`, not `1.01`. Tax rules round half up,
so a checker that does this flags a correct invoice, or repairs a wrong one to
the wrong cent.

[einvoice-preflight](../../ventures/einvoice-preflight/) fixed this in its
main checks earlier today. A grep for the same pattern found four places the
fix missed: the Polish FA(3) checks (net, VAT and total), the Italian
FatturaPA group totals, the UBL repair tool's output amounts, and the credit
note link's gross-in-cents. All now round half up the same way (the
12-significant-digit trick the main checks use). A test pins `fmt(1.005)` to
`1.01`, `fmt(0.285)` to `0.29` and `fmt(-1.005)` to `-1.01`.

The pages and their unit tests pass (95 tests across the touched suites).
This is a code check against the half-up rule, not a comparison with a tax
authority's validator.
