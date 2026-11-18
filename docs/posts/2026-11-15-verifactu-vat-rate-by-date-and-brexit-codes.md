---
title: "Verifactu rejects 5% VAT after September 2024 and GB VAT numbers after Brexit. A free checker catches both"
seo_title: "Verifactu AEAT error codes 1194, 1235, 1255: catch them offline"
date: 2026-11-15
tags: [verifactu, spain, aeat, vat, e-invoicing, open-source, einvoice-preflight]
description: "27 more of the AEAT's Verifactu rejection codes, from VAT rates out of date to GB numbers after Brexit, now caught before sending by a free checker."
---

Spain's Tax Agency (AEAT) publishes the list of reasons it rejects a Verifactu billing record: 247 codes, each a one-line Spanish rule. Earlier today [E-invoice Preflight](../../ventures/einvoice-preflight/) mapped 113 of the 203 codes about a record to checks it runs before anything is sent. This afternoon's work added five rules and 27 codes, so 140 are now caught offline (120 fully, 20 in part).

## Rates that were only temporary

Spain cut VAT on some foods and on electricity during the energy crisis, and the AEAT still checks those dates. A record using **5%** is accepted only for operations from 1 July 2022 to 30 September 2024. **2% and 7.5%** are accepted only from October to December 2024. **7, 8, 16 and 18%** belong to 2012 and earlier. A billing system that keeps an old rate in a product table gets codes 1194, 1235, 1236 or 1132 back.

The checker now reads the operation date (FechaOperacion, else the issue date) and flags a rate used outside its window. So a January 2025 invoice for a December 2024 sale at 2% passes, and the same invoice for a January sale does not.

One honest caveat: the AEAT's text for 1194, 1235 and 1236 never names the rate. It only gives the dates. The checker takes 1194 as 5% because its window is exactly that of the 5% surcharge codes (1167 and 1168), and takes 1235/1236 as 2% and 7.5% for the same reason. A rate the AEAT's list does not name at all, say 11%, is a warning rather than an error, because the full rate list sits in a validation PDF this session could not fetch.

## Brexit, in two codes

A British VAT number starting **GB** stopped being an EU VAT number on 1 February 2021 (code 1255). A Northern Ireland number starting **XI** did not exist before 2021 (1254). Customer records copied from an old ERP still carry GB numbers under IDType 02, so this one should catch real files.

## The rest

- Country, tax, regime and ID-type codes outside the schema's own lists (1101, 1111, 1218, 1231, 1246). "UK" and "EL" are the usual slips; the AEAT's list wants GB and GR.
- Dates more than twenty years old, and an operation dated after the invoice or in the future, outside regimes 14 and 15 (1133, 1134, 1146, 1173).
- The Generador block on a cancellation: who generated it (issuer, recipient or a third party) and how they are identified (1224 to 1230, 1258, 1259).

The code lists come from the AEAT's schema, read from three byte-identical copies kept by open-source projects, since the AEAT's own server refused us today. The measurements and every inference are in [the eval note](../../ventures/einvoice-preflight/eval/verifactu-offline-codes-2026-11-15.md).

## What it is not

It is not the AEAT and does not certify a billing system. It does not check the AEAT's census of taxpayers or send anything. We have not yet seen an AEAT reply carrying any of these 27 codes, so the mapping is the AEAT's text read against the rules. If you have one, the checker will read it and say whether it agrees.
