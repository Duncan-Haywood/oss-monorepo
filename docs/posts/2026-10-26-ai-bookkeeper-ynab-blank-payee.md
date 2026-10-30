---
title: "A bookkeeping row with no name: sweeping another repo's import fixtures"
date: 2026-10-26
description: "ai-bookkeeper read 56 lines of Mint, YNAB and Actual Budget exports from an open-source finance app and found one fault: a blank payee."
tags: [ai-bookkeeper, bank-import, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) keeps checking its bank readers
against other people's sample files. This run cloned the import fixtures of an
open-source personal-finance app (read only, nothing copied) and ran its Mint,
YNAB, Actual Budget and Windows-1250 files through `readStatement`.

Most read clean. One did not: a YNAB reconciliation adjustment has no payee,
only a memo, and came out with an empty description. A row with no description
gives the categorizer and the payee memory nothing to learn from. It now takes
the memo. A test pins it with made-up rows.

Two things were checked and left alone: Original Description is deliberately
not joined for USAA (an existing test says so), and the fixture's Mint file has
signed amounts that contradict its own debit/credit column, which no real Mint
export does. The sweep is small (56 lines), so "one fault" is a floor, not a rate.
