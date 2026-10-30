---
title: "Invoices for a babysitter: a week on one page, and card payments on her own Stripe"
date: 2026-10-30
description: "The babysitting kit now makes numbered invoices, receipts and an aging view, with optional card payments that go only to the sitter's own Stripe account."
tags: [babysitting-business-kit, small-business, stripe]
---

A babysitter with a weekly family sends the same message every Friday: "Hi! For this week it's $69 for Tuesday and $69 for Thursday." Then she checks Venmo, forgets whether Tuesday was already paid, and writes it on a sticky note. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) already knew who owed what (its Today list counts unpaid sits). This change gives her the paper she sends.

**An Invoices tab.** Pick a family and a period (one sit, or "Last week (Mon-Sun)" for a recurring family) and the kit makes `INV-2026-001`: each sit with the lines the rate card priced it from (`3 h × $23/h (2 children)`), what is already paid, the balance and a due date (7 days by default). It prints, or saves as a PDF from the browser's print dialog. The "how to pay" box shows only what the sitter typed in her settings: her Venmo, Zelle, Cash App, PayPal or "checks payable to".

**One rule for what is paid.** Payments still live on the sits, as before, and pay the oldest sit first. The invoice balance, the new aging table and the Today list all use that one rule, and the tests hold them to it: on the invented example desk, with a sit 79 days old and one 43 days old added, the aging view puts $60 in "over 60 days", $35 in "31-60" and $92 in "1-30". Its total equals what `unpaid()` reports, checked on four different days. If an invoice covers a sit, the sit is "current" until the invoice's due date.

**Tips are separate.** A tip is recorded as its own payment. It counts as income in the tax summary, but it never pays down what a sit cost. Before this change a $10 tip would have hidden $10 of an unpaid sit.

**Receipts.** Every payment gets a numbered receipt (`INV-2026-001-R1`) showing the amount, the tip, the sits it covered and what is left on the invoice.

**Optional card payments, on her account only.** If she runs the kit's server and sets her own `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, each invoice's private pay link offers "Pay by card". The family can add a 10, 15 or 20% tip, or an amount of their own, if she has turned tips on. The server creates a Stripe Checkout Session with a plain `fetch` (no SDK). When Stripe sends `checkout.session.completed`, the server records the payment on the sits, once per session, so Stripe's retries are not double-counted. It checks the `Stripe-Signature` header first, following [Stripe's published scheme](https://docs.stripe.com/webhooks): HMAC-SHA256 over `timestamp.body`, `v1` signatures only, 5-minute tolerance, constant-time compare. The test uses a known-answer signature computed separately with `openssl dgst -sha256 -hmac`, not with the code under test. Nothing is charged until she sets keys, and the money never passes through anyone else's account. Stripe charges her its own fee per payment.

The kit's test suite went from 198 to 212 tests (14 new). Everything is MIT and free to run yourself; the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit) has the setup steps.
