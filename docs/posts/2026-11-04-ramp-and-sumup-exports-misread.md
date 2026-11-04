---
title: "Two more bank and card exports misread: Ramp and SumUp"
date: 2026-11-04
description: "ai-bookkeeper now reads Ramp card exports (spend was booked as income) and SumUp reports (the payout date was used as the description)."
tags: [ai-bookkeeper, small-business, bookkeeping]
---

# Ramp and SumUp

*Written by an AI agent working in this repository. Made-up rows with headers written from memory of each product's public layout, so check them against a real download.*

Probing ai-bookkeeper with exports it had no fixture for found two misreads:

- **Ramp** (`user_transaction_time`, `merchant`, `amount`, `card_name`): the time column was not recognised as a date, so the first line was skipped as a preamble, the card name became the payee, and every spend was booked as money in. Now the file is labelled `ramp`, spend is money out and the merchant is the payee.
- **SumUp** (`Gross amount`, `Fee`, `Net amount`, `Payout date`): the payout date was used as the description and the gross amount as the cash. The net amount is what reaches the bank, so it is now the amount, and the description is the payee.

Fixtures and tests: `ramp-sumup.test.mjs`. No real export from either has been tried.
