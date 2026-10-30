---
title: "Check an India e-invoice JSON payload in your browser before the IRP rejects it"
seo_title: "India GST e-invoice INV-01 JSON checker, free, in your browser"
date: 2026-10-30
tags: [einvoice-preflight, india, gst]
description: "The India page of einvoice-preflight now has a paste box that checks an INV-01 payload for GSTIN, PIN, date, GST slab, IGST/CGST split and total errors, locally."
---

Businesses above the ₹5 crore GST threshold must register B2B invoices with India's invoice registration portal (IRP), which rejects a payload for one wrong field. The [India page of einvoice-preflight](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/india-gst-e-invoice-mandate.html) now has a paste box for the INV-01 JSON.

It names the field for each fault: missing blocks, GSTIN shape and check character, six-digit PINs, DD/MM/YYYY dates, HSN length, GST slab, IGST versus CGST+SGST against place of supply, line arithmetic and the totals (one-rupee rounding tolerance). It runs in the browser and nothing is uploaded.

Limits: the rules come from memory of the public schema and secondary guides, not the IRP specification, and no real IRP payload or rejection has been run. Tests use made-up invoices, so a clean result is not an IRN. A real sandbox payload is the next thing wanted.
