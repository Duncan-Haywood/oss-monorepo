---
title: "A Japanese Peppol invoice failed for European reasons, and so did 120 others"
seo_title: "Peppol PINT JP, MY, AE, OM validation: free offline check of OpenPeppol examples"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Japan, Malaysia, the UAE and Oman each publish their own Peppol PINT rules. Our checker had been testing their invoices against the EU's. Of OpenPeppol's 123 examples for those four countries, 2 passed before the fix and 117 pass after."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks an e-invoice on your own machine before you send it. Peppol PINT is the international version of the Peppol invoice. Each country adds its own layer of rules on top, and the invoice names the country in its `CustomizationID`, for example `urn:peppol:pint:billing-1@jp-1` for Japan.

Until today the checker knew two of those layers, Singapore and Australia/New Zealand. An invoice that named Japan, Malaysia, the UAE or Oman matched neither, so it fell through to the European rules (EN 16931). Those rules expect European things, so they rejected:

- every Japanese, Malaysian and Emirati tax number, because it is not a VAT number with an EU country prefix (BR-CO-09);
- Malaysia's tax categories, because they are not on the EU list (BR-CL-17/18);
- the UAE's and Oman's dates (UBL-DT-01).

Our own built-in checks made it worse. They called Japan's corporate-number addresses (scheme 0188) and Oman's (0248) unknown.

## The measurement

OpenPeppol publishes example invoices for each country, and the phive validator project lists most of them as files that must pass. We ran the whole preflight over every one of them, the same way the page runs it:

| profile | files | before | after |
|---|---|---|---|
| Japan | 9 | 0 | 8 |
| Japan, seller not registered for consumption tax | 7 | 0 | 7 |
| Malaysia | 26 | 2 | 26 |
| UAE | 32 | 0 | 31 |
| Oman | 49 | 0 | 45 |
| **total** | **123** | **2** | **117** |

The rules come from the same Maven Central package as the Singapore ones: nine more profiles, from 28 to 154 country checks each on top of a shared 170-check PINT base. With the right rules loaded, OpenPeppol's rules passed every file. Everything that still blocked was a check of ours, so we read each one before changing anything.

## What was ours

**Oman marks severity differently.** Oman's rule file opens every invoice with a report that just names the ruleset version, "Not a failure". It marks severity as `role="information"` and has no `flag` attribute. Our compiler read a missing flag as fatal, so once loaded, every Omani invoice would have failed on that banner. It now reads `flag`, then `role`, and leaves out a report that always fires.

**Our list of address schemes was 19 codes short.** These are the Peppol codes that say what kind of ID an electronic address is. OpenPeppol's current list includes Japan's corporate number, Oman's and 17 others. That fix applies to European invoices too.

**Japan writes the tax breakdown twice.** If a Japanese invoice is in euros, PINT JP repeats the breakdown in yen. We had been adding both together and then reporting a duplicate rate.

**Some rows state a rate and charge nothing, on purpose.** A Japanese seller not registered for consumption tax writes 10% and a tax of zero. In the UAE, reverse-charge and margin-scheme rows write 5% and zero too. Malaysia's tourism tax is 10 ringgit a night, with no percentage at all. Our "taxable times rate" check can't model those, so it steps aside where the country's own rules cover the row. A real arithmetic error on an ordinary Japanese invoice still blocks; there is a test for that.

## What is left

Six files still draw a finding. We kept those findings, because each one is either a real fault in the example or a real gap of ours.

- One Japanese example gives the seller a 19-digit GLN. A GLN has 13 digits.
- One UAE credit note gives a volume discount and names no invoice it corrects. A discount for a period can cover many invoices, so we don't yet know whether to flag it.
- Four Omani files have line amounts in baisa, to three decimals (0.047 rial), under totals in two decimals. We round each line to cents before adding, so 10 lines come to 0.50 when they should come to 0.47. Fixing that means adding lines at their stated precision on every route, the European one included. That is the next piece of work, and it will get its own measurement.

None of this is an access point's verdict. The examples come from the rule authors, not from real businesses. If you send PINT invoices in any of these four countries, a real file would be the most useful test we could get.
