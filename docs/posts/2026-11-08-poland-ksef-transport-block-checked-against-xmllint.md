---
title: "Poland's KSeF invoice checker now covers the transport block, tested against the official schema"
seo_title: "KSeF invoice checker: the transport block, schema-tested"
date: 2026-11-08
tags: [einvoice-preflight, poland, ksef, testing]
description: "A made-up FA(3) invoice with two transport entries joined the differential test: 6,550 mutations, 6,550 agreements with xmllint."
---

Poland's KSeF e-invoice format (FA(3)) has a `WarunkiTransakcji` block for delivery terms and transport: carrier, cargo, times and a route through several countries. Our free, in-browser checker had never been tested on it, because none of its sample invoices contained one.

We built a made-up invoice with two transport entries (one using the normal transport-type branch, one using the "other transport" choice branch), confirmed the official schema accepts it, and added it to the differential test. The test breaks invoices at random (an element deleted, duplicated, swapped, emptied, lengthened, given a euro sign, a bad date) and asks both the official schema validator (`xmllint`) and our checker for a verdict. Across 6,550 broken variants of five sample invoices, the two agreed every time.

Limits: the invoice is invented, not a real KSeF file, and the check covers the schema, not KSeF's own business rules. Try it at the E-invoice Preflight page; nothing is uploaded.
