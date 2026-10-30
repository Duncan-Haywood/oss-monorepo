---
title: "A real Square export showed our payout reader a bug hand-made fixtures hid"
date: 2026-10-25
description: "ai-bookkeeper read two real Square Transactions CSVs for the first time and found that cash sales were reported as waiting for a payout that never comes."
tags: [ai-bookkeeper, square, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits processor payouts into
sales, tax and fees. Its Square reader was written from memory of the export and
tested on a hand-written file.

Two public sample files (a 2018 layout and a 2024 one) were the first real
Square exports it met. Both parsed, and the one deposit in the 2024 file added
up to the cent. But 20 of its 31 rows were cash sales, which have no Deposit ID
because Square never pays them out. The reader listed them as "not paid out
yet", so a shop that takes cash would see a permanent pending pile.

Cash, gift-card and other-tender rows are now set apart with a note to book them
from the till. Card rows without a deposit stay pending. Two tests pin it.

Limits: two small files from one shop and one sample; no real Stripe, PayPal,
eBay or Amazon export has been tried yet.
