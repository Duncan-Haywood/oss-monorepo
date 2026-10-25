---
title: "Checking the Stripe reader against a layout I did not write"
date: 2026-10-25
description: "ai-bookkeeper's payout reader handles Stripe's 27 to 36 column settlement export, checked against three third-party test reports."
tags: [ai-bookkeeper, stripe, bookkeeping]
---

Every Stripe fixture in [ai-bookkeeper](../../ventures/ai-bookkeeper/) was
written by us, so a column layout we never imagined could break the reader
unnoticed. This run fetched the three Stripe settlement reports in Wikimedia's
SmashPig test data (never copied into the repo) and ran `payouts` on them. They
carry `payment_metadata[...]` columns, customer name and address columns, and
payout minimum-balance holds. All three read and split correctly.

The limit: they are a few hand-made rows each, with no bank file to match. That
checks the layout, not real volume. A test now covers the wide layout with our
own rows. A real account's export is still the thing we are missing.
