---
title: "Importing a Patreon earnings report into your books"
seo_title: "Import a Patreon earnings CSV into bookkeeping, net of fees"
date: 2026-11-06
tags: [ai-bookkeeper, creators, bookkeeping]
description: "The free ai-bookkeeper now reads a Patreon earnings report, booking Creator Share (what you keep after fees) under the event type."
---

A Patreon creator's earnings report has several money columns: the gross pledge, Patreon's platform fee, the payment-processing fee and the creator's share. A bookkeeping import that guesses one of them can book the gross as income and miss the fees entirely.

The browser bookkeeper now recognises the report by its `Creator Share` and `Event Type` columns, books `Creator Share` as the amount (what actually reaches you) and uses the event type (Pledge, Refund) as the description, so patron names never end up in your ledger.

One test covers it: two pledges and a refund, checked in cents. The column names come from a third-party importer's notes, because Patreon's own help pages list none; the rows are made up and no real export has been tried. If your download reads wrongly, say so through the feedback form on the page. Arithmetic on your own file, not accounting advice.
