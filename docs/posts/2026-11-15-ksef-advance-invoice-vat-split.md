---
title: "How the VAT on a Polish advance invoice is split, from the Ministry's own examples"
seo_title: "FA(3) advance and settlement invoices: how P_13 and P_14 split"
date: 2026-11-15
tags: [einvoice-preflight, ventures, poland, ksef]
description: "FA(3) advance and settlement invoices split the payment across VAT rates by gross share. We now check it; the Ministry's 26 examples found six of our bugs."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has checked the sums on Polish KSeF invoices (the FA(3) XML structure) since October, but only on plain ones: `RodzajFaktury` VAT or UPR. Corrections (KOR), advance invoices (ZAL), settlements (ROZ) and their corrections were skipped, with a note saying so, because nobody here could say for sure what their totals should add up to.

The answer turned out to be on the Ministry of Finance's own download page. Next to the user guides on ksef.podatki.gov.pl sits a zip of **26 example FA(3) invoices**, with a PDF describing each one. Unlike the client templates in the Ministry's GitHub repositories, these cover every invoice kind: 12 VAT, 5 corrections, 3 corrected advances, 2 settlements, 2 simplified invoices, 1 advance and 1 corrected settlement. Their numbers show the arithmetic.

## The rules, read from the files

**A correction (KOR)** that shows a changed line twice, once as it was (flagged `StanPrzed`) and once as it should be, totals the difference: after minus before. Example 2 cuts a fridge from 1,626.01 to 1,463.41 net, so P_13_1 is -162.60, the VAT -37.40, and P_15 -200.

**An advance (ZAL)** doesn't total its lines at all. The payment received, P_15, is split across the VAT rates in proportion to each rate's share of the order's gross value. Each share is rounded to the grosz, the tax is share × rate / (100 + rate), and the net is whatever is left. Example 10: a 20,000 advance on an order that is all at 23% gives 16,260.16 net and 3,739.84 VAT.

**A settlement (ROZ)** does the same with what is left to pay, using the gross of the invoice's own lines. In example 14, 307,635 remains on an order of 307,500 at 8% and 4,500 at 23% (gross 332,100 and 5,535). The 23% share is 307,635 × 5,535 / 337,635 = 5,043.20, which gives 943.04 VAT and 4,100.16 net. That is what the file says.

**Corrections of advances and settlements (KOR_ZAL, KOR_ROZ)** take the split after the correction and subtract the split before it. Example 11 fixes an order line that should have been 8%, not 23%. The advance stays 20,000, so P_15 is 0, but the VAT moves between rates: -15,993.60 and -3,678.53 at 23%, then +18,214.94 and +1,457.19 at 8%. Our formula gives the same figures to the grosz.

KSeF itself doesn't check any of this. Its published list of checks on receipt covers encoding, characters, size, dates and NIP check digits, but no sums. A wrong split gets accepted and ends up as a wrong VAT record. Catching it before sending is the issuer's job, which is where this checker fits.

## What the examples found in our checker

Before writing any new rules, we ran the old checker on all 26 files. It raised **six findings on the Ministry's own invoices, and all six were our bugs**:

- **A floating-point compare.** Example 1 is priced in gross, so its totals come to 2,050.99 against a P_15 of 2,051. We meant to allow a one-grosz gap, but `Math.abs(2051 - 2050.99) > 0.01` is true in floating point. Amounts are now compared in whole grosze.
- **Simplified invoices.** One gives a line that only names the goods. The other states P_15 and no totals at all, which the Ministry allows when the invoice has a single rate.
- **Correction pairs share a line number.** The Ministry's PDF says the before and after rows are numbered separately, but its files give them the same number. So numbers now only have to be unique within the before rows and within the after rows.

## The measurement

`eval/ksef-ministry-examples.mjs` downloads nothing on its own (the zip link is in its header) and copies nothing into the repository. It runs the checker on each file, then plants a fault in each stated total, one at a time: +0.03 for a rounding slip and +1.00 for a wrong amount.

| | Before | After |
|---|---|---|
| Findings on the Ministry's 26 files | 6 (all false) | 0 |
| Planted total faults caught | 78 of 166 | 164 of 166 |

The two misses are both on the simplified invoice that states P_15 alone, where there is nothing to add it up against. The full table is in `ventures/einvoice-preflight/eval/ksef-ministry-examples-2026-11-15.md`.

## Limits

These are teaching examples, not invoices a business actually sent, and we still have no real KSeF rejection to compare against. Some cases are skipped and named in the report:

- a correction of an advance written as a bare difference (no before rows);
- one without P_15ZK, the amount before the correction;
- a split that includes margin, taxi lump-sum or OSS rows.

The checker is offline, free and MIT-licensed, and it isn't tax advice. To try it, drop an FA(3) file on the [Poland KSeF page](https://marisstella.app/einvoice-preflight/poland-ksef-e-invoice-mandate.html).
