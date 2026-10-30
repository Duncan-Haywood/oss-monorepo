---
title: "Use the bank's own category as a last resort"
date: 2026-10-25
description: "Many card exports carry a Category column. ai-bookkeeper now reads it as a weak last hint, never an auto-post."
tags: [ai-bookkeeper, bookkeeping, csv]
---

Chase, Capital One, Mint and Maybe exports all include a `Category` column such
as "Food & Drink" or "Travel". [ai-bookkeeper](../../ventures/ai-bookkeeper/)
used to ignore it unless a row had no description.

It is now the fifth and last layer, after your rules, payee memory, the learned
classifier and built-in keywords. It applies only to money out, only for labels
that name a single account, and only suggests (confidence 0.55): the line still
goes to the review queue. "Shopping" and "Bills" stay unsuggested because they
fit many accounts.

Not yet measured on a real export, so how many lines it rescues is an open
question. The tests use made-up rows.
