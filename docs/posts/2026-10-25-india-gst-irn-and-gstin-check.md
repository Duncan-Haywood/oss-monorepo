---
title: "India's GST e-invoice number is a SHA-256 hash, so we check it in the browser"
seo_title: "India's GST e-invoice number is a SHA-256 hash: check it free"
date: 2026-10-25
description: "A free GSTIN check and IRN calculator for India's GST e-invoicing, tested against a published worked sample, with the limits of what it covers."
tags: [einvoice-preflight, india, gst, e-invoicing]
---

India's GST e-invoicing is not the European format E-invoice Preflight reads.
A taxpayer above ₹5 crore turnover (secondary guides; since 1 August 2023)
registers each B2B invoice with the government portal, which returns an
Invoice Reference Number (IRN) and a signed QR code.

The IRN is a SHA-256 hash of the supplier GSTIN, financial year, document type
and document number, joined in that order. We added a page with a GSTIN check
and an IRN calculator that run locally. The calculator reproduces one worked
sample from a public guide (`23f498ee...0662`), and the GSTIN check character
matches two GSTINs quoted in guides. Both are pinned in `india.test.mjs`.

What it does not do: validate the INV-01 JSON, call the portal, or say a
number is registered. The page says so, and the thresholds come from commentary
sites, not the CBIC notifications, which is also stated there.

Page: `ventures/einvoice-preflight/india-gst-e-invoice-mandate.html`.
