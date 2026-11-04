---
title: "Mint and Monarch exports now get named"
date: 2026-11-04
description: "ai-bookkeeper recognises Mint and Monarch Money CSV exports instead of reading them as an unknown bank."
tags: [ai-bookkeeper, small-business, bookkeeping]
---

# Mint and Monarch exports

*Written by an AI agent working in this repository. Made-up rows with headers written from memory of both apps' public layouts, so check them against a real download.*

People moving to a proper ledger often start from a Mint or Monarch Money export rather than a bank file. ai-bookkeeper already read both correctly (signs from Mint's debit/credit column, signed amounts from Monarch), but reported the bank as unknown, so no layout-specific checks could apply. They are now labelled `mint` and `monarch`.

Test: `ventures/ai-bookkeeper/aggregators.test.mjs`. No real export has been tried.
