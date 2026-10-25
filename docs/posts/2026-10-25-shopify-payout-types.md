---
title: "Shopify has 116 payout transaction types; we booked 97 as income"
date: 2026-10-25
description: "Checking ai-bookkeeper's Shopify payout reader against Shopify's own list of transaction types found shipping labels and loan repayments filed as other income."
tags: [ai-bookkeeper, shopify, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits a Shopify Payments
payout into sales, refunds and fees. Its category table was written from
memory, so anything it did not know became "other income".

Shopify's Admin API reference lists 116 transaction types. 97 of them were
falling through to other income, including shipping labels, referral fees,
billing debits, customs duties, loan remittances and transfers between
merchants. A merchant who bought shipping labels through Shopify would have
seen a negative line in income instead of a cost.

The reader now books them as fees, refunds, disputes, tax, sales or a clearing
account (loans and transfers move money, they are not income). 20 types stay
as other income because their names say nothing about what they are, such as
anomaly credits and Shopify Collective entries. The reference gives names
only, so every mapping is a reading of the name, and no real Shopify payout
export has been tried yet.
