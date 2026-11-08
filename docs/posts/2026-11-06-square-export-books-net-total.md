---
title: "Importing a Square transactions export used to read zero rows"
seo_title: "Square transactions CSV to bookkeeping: importing Net Total"
date: 2026-11-06
tags: [ai-bookkeeper, square, bookkeeping]
description: "The open-source ai-bookkeeper now reads Square's transactions export and books Net Total, the money Square pays out after its fee."
---

Square's transactions CSV has dozens of columns, dollar-sign amounts and no balance column. ai-bookkeeper's bank reader skipped the whole file as a preamble and imported nothing.

It now recognises the header (Gross Sales, Fees, Net Total, Transaction ID), books Net Total, and uses the item description (or the event type) as the payee. A refund comes through as money out.

The test uses a made-up two-row file built from the column names Square publishes; no real export has been tried. As with Stripe and PayPal, booking Net alone leaves sales understated and the fee unbooked, so the `payouts` splitter is still the right route for gross sales and fees.
