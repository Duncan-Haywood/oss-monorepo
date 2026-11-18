---
title: "Brazil's reform invoices carry a six-digit tax code the schema can't check"
seo_title: "cClassTrib validator: check NF-e and NFS-e IBS/CBS tax codes"
date: 2026-11-13
tags: [einvoice-preflight, ventures]
description: "Every Brazilian reform invoice item carries a CST and a six-digit cClassTrib the schema cannot check. We now check them against the published table."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) checks an e-invoice in your browser before you send it. Its Brazilian checks read NF-e, NFC-e and the national NFS-e, including the new IBS and CBS groups of the tax reform. Until today those checks had one gap that matters more than the others.

## Two codes on every item

From 2026 each item on a Brazilian invoice states how the new taxes apply to it, in two codes:

```xml
<IBSCBS>
  <CST>200</CST>
  <cClassTrib>200030</cClassTrib>
  <gIBSCBS>…<gRed><pRedAliq>60.0000</pRedAliq><pAliqEfet>0.0400</pAliqEfet></gRed>…</gIBSCBS>
</IBSCBS>
```

`CST` is the tax situation: 000 for full tax, 200 for a reduced rate, 410 for immunity, and so on. `cClassTrib` names the legal case within that situation: which article of Lei Complementar 214/2025, which reduction, which documents it may appear on. The government publishes one table of these: 18 CSTs and, in the version of 22 June 2026, 164 classification codes.

The XML schema checks only that `CST` is three digits and `cClassTrib` six. A code that does not exist, a code from another CST, or a 60% reduction applied to a code that has none all pass the schema.

## What the check reads

`cclasstrib.mjs` holds the table and asks five questions of each item:

1. Is the code in the table, and do its first three digits match the CST?
2. Does the table allow it on this document? Many codes are for CT-e, BP-e or NFS-e only.
3. Was it valid on the issue date? Three codes of CST 220 ended on 1 January 2026.
4. Are the item's groups ones the CST takes? An immune item (CST 410) takes no `gIBSCBS` values, and a presumed-credit group needs a code that grants one.
5. Is the stated reduction the code's own? The schema's note on `pRedAliq` says it is the "percentual de redução de aliquota do cClassTrib", so it has to equal the table's pRedIBS or pRedCBS. The effective rate `pAliqEfet` then has to be the rate less that percentage.

That last point also settled something we had left open. The NFS-e check used to skip effective rates when a reduction was stated, because we had not established whether `60.00` meant 60% or a fraction. Unimake's published reform samples, for NF-e and NFS-e alike, write a 60% cut on a 0.10% rate as `60.0000` and `0.0400`. Together with the schema's word "percentual", that settles it, so the NFS-e effective rates are checked now as well.

## Where the table came from

The table's home is the government's Conformidade Fácil portal. Its hosts refused our build machine, so the build reads a copy of the portal's own JSON answer that someone committed to a public repository, pinned by commit and SHA-256. We didn't take one copy on trust. We compared it with two independent copies. A lookup dated 15 April 2026 has 156 codes, all present with the same names (the June table adds 8). A spreadsheet export dated 19 May 2025 agrees on the CST and on both reduction percentages for all 138 codes the two share.

## What it found on real files

GitHub code search for `cClassTrib` returned 286 XML files: 196 distinct after removing copies, 113 of them NF-e or NFC-e and 70 NFS-e. 42 raised a classification finding. Every one we looked at was a placeholder, not a misreading on our side:

- 34 copies of one tutorial use the code `111111`, and four files of another project use `654321`, `654322` and `030010`. None of these is in the table.
- An open-source library's reform illustration, and two copies of a validator's sample, write a 1% reduction on `000001`, the code for full taxation, which has no reduction.
- A vendor's national NFS-e sample pairs `000001` with CST `101`. That CST is not in the table.

Unimake's examples with real 60% and 100% reductions (codes 200014, 200030, 200038) read clean, effective rates included.

## What it doesn't do

We have not read SEFAZ's or the national system's rejection codes for these errors, so the findings don't name one. We don't read the presumed-credit (`cCredPres`) table, or the rates themselves. A clean result is not an authorisation. Tables change, too: if a code was added after 22 June 2026, the check will call it unknown until the table is rebuilt.

The check runs on the [Brazil page](https://marisstella.app/einvoice-preflight/brazil-nfe-e-invoice-mandate.html) and in the main checker, entirely in your browser. The code is MIT-licensed.
