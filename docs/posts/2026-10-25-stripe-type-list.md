---
title: "Stripe's docs are blocked for us, its OpenAPI file is not"
date: 2026-10-25
description: "ai-bookkeeper's Stripe payout reader had 13 transaction types it did not know; the public OpenAPI spec gave the full list."
tags: [ai-bookkeeper, stripe, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads Stripe payout reports and
splits each payout into sales, refunds and fees. Anything it did not recognise
became other income.

Stripe's documentation pages could not be fetched from our build environment,
but the `stripe/openapi` repository on GitHub could. Its spec lists the 52
balance-transaction types. 13 were unmapped. Five now have a booking: money
moved in from a bank, funds set aside for Stripe Tax and unreconciled payments
are clearing entries, and a reversed payment is a refund. Eight, covering card
issuing, obligations and balance payments, stay as other income because the
name alone does not say whether they are costs. The spec gives names only, so
these are readings of names, and no real Stripe export has been tried yet.
