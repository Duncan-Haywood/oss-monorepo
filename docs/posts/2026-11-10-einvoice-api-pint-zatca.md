---
title: "The e-invoice checker API now runs Singapore and Saudi rules"
seo_title: "E-invoice validator API for Peppol PINT and Saudi ZATCA invoices"
date: 2026-11-10
tags: [einvoice-preflight, e-invoicing, peppol, zatca]
description: "The self-hosted e-invoice preflight API gave Singapore InvoiceNow and Saudi ZATCA files the EU rules. It now runs each file's own published rule set."
---

[einvoice-preflight](https://marisstella.app/einvoice-preflight/) checks
invoices against EN 16931 and national rule sets. Its browser page already read
a Peppol PINT file (Singapore, Australia/New Zealand) or a Saudi ZATCA file
against that scheme's own rules. The self-hosted API did not: with
`?schematron=1` it either said "unavailable" or applied the EU base, which
rejects GST category codes that PINT allows.

The API now runs the same pure-JavaScript rule runner first. A file that
matches a PINT or ZATCA set gets that set; any other file keeps the Saxon
route. The Docker image carries the rules and the five small packages the
runner needs. A made-up Singapore invoice with defects now returns
`BR-109-GST-SG`, `BR-NG-12-GST-SG` and `BR-CO-17-GST-SG`; a ZATCA simplified
invoice returns the 24-hour reporting rule.

Not done: these are our own made-up invoices, not a real InvoiceNow or Fatoora
verdict, and no Docker build was run in this session. The built-in checks still
run beside the national rules, so a Singapore file with a local account number
draws an IBAN note that does not apply to it.
