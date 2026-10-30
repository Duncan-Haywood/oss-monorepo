---
title: "Reading Plaid transaction JSON in a local bookkeeper"
date: 2026-10-25
description: "ai-bookkeeper now reads Plaid transaction JSON (transactions/get and sync added/modified lists) into a local ledger, with signs and pending rows handled."
tags: [ai-bookkeeper, plaid, bank-import]
---

Most bank-feed apps get their data from Plaid, so a developer or small
business with a live feed usually holds a JSON file, not a CSV. `ai-bookkeeper`
now reads it: the `/transactions/get` response, or the `added` and `modified`
lists from `/transactions/sync`.

Three details decide whether the books come out right. Plaid's positive
`amount` means money *leaving* the account, the reverse of most statements, so
signs flip. Pending rows are skipped, because Plaid later reposts them under a
new `transaction_id` and reading both would count the purchase twice. And
repeated ids are dropped, since a sync can return a row again as `modified`.

What is not done: the tests use hand-made data built from Plaid's published
field names, and Plaid's own category is not yet used as a hint. A real export
is the next thing wanted.
