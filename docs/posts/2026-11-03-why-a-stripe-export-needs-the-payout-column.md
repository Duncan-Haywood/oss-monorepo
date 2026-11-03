---
title: "Why a Stripe export needs the payout column"
seo_title: "Stripe balance export to bookkeeping: add the payout ID column"
date: 2026-11-03
tags: [bookkeeping, stripe, open-source, ai-bookkeeper]
description: "A plain Stripe balance export can't be matched to a bank deposit. ai-bookkeeper now says which column to add instead of failing vaguely."
---

A Stripe deposit reaches your bank as one number. Say the bank shows $970.00. Stripe's records say $1,000.00 of sales less $30.00 of fees. To book that correctly you have to split the lump back into its parts, and that only works if every charge, refund and fee in the export says which payout it belongs to.

The most common Stripe export, "Balance change from activity", can leave that column out. hledger's public sample (`examples/csv/other/stripe.csv`) is exactly that shape: a transaction ID, a UTC date, gross, fee, net and a reporting category, with no payout ID. ai-bookkeeper's `payouts` command used to answer with a generic "no payout id column" error. It now spells out the fix: in Stripe, go to Reports, then Balance, then "Balance change from activity", choose Edit columns, tick `automatic_payout_id`, and export again. The Payout reconciliation report works too.

What this does not do. The sample file has two rows and no payout column, so it can't test the split itself. The split is still checked only on hand-made and test-schema data. A real payout reconciliation export is still the open item, and a reader who has one with the private details removed is welcome to open a request for it.

The tool is free and runs in the browser or the command line: `node cli.mjs --books books.json payouts stripe.csv`.
