---
title: "We ran the rule authors' own good invoices through our e-invoice checker"
seo_title: "E-invoice validator tested on NLCIUS, CIUS-RO, CIUS-PT and ZATCA files"
date: 2026-11-11
tags: [einvoice-preflight, testing]
description: "The rule authors' own good invoices for Dutch, Romanian, Portuguese and Saudi rules found a hang, a severity bug and two false rejections. All fixed."
---

The national e-invoicing rule sets ship with example files. phive-rules, the open-source validator, keeps them in its test folders. Each module's `CTestFiles.java` names the files that must pass. That list is a free test: a file the rule authors call good should not fail our checker either. Our corpus script now reads the list (`eval/phive-corpus.mjs --good`) and scores only those files.

Four things turned up:

- **A Portuguese invoice with an attachment froze the checker.** One CIUS-PT rule checks the attached document with the regular expression `^(.{1,6826666})$`. The XPath engine we use in the browser turns a bounded repeat into one state per count, so the check grew to 4.4 GB and never finished. That would freeze the page on any Portuguese invoice with a PDF attached. We now rewrite that shape into the same test done with string lengths. Each of AMA's ten examples takes about 3 seconds.
- **Official warnings failed the file.** SimplerInvoicing's Dutch examples include 25 files that exist to show a warning (fields NLCIUS says to leave out). Our checker counted warnings as failures. The official validators don't, so we no longer do either. Warnings are still listed and labelled.
- **Romanian buyers without a VAT number got a VAT error.** ANAF's examples put a public buyer's bare fiscal code in a tax scheme with no VAT label. We read it as a VAT number with no country prefix. The EU rule only reads the scheme labelled VAT, and now we match it.
- **Saudi files tripped five EU-only checks.** Saudi credit notes use the Invoice document with type 381. Simplified invoices name no buyer. ZATCA's own cut of the EU rules leaves out the allowance-reason and bank-account rules. With those checks skipped where ZATCA's rules apply, 18 of ZATCA's 19 examples pass, up from 8.

Some findings are not ours to fix. The Dutch examples use placeholder IBANs like `NL11 BANK 1111111111`, and the Romanian ones use a 13-digit seller VAT number. Several lines bill 2 × 1273.00 as 1273.00, and the Portuguese files are templates with `$%()*` in the fields. The checker should reject all of these, and it does.

These are examples written by rule authors, not invoices from real businesses, and no tax portal's verdict was compared. The full table and what is still open are in the einvoice-preflight README.
