---
title: "When a bank file's minus sign points the other way"
date: 2026-10-26
description: "A debit/credit column was ignored whenever an amount had a minus sign, so a debit-positive export read backwards. Fixed, with three tests."
tags: [ai-bookkeeper, bookkeeping, csv, bank-import]
---

A CSV can carry both a signed amount and a debit/credit column. Maybe's sample Mint import has one: debits are positive, credits negative. AI Bookkeeper's reader skipped the debit/credit column whenever any amount had a minus sign, so all ten sample rows came out backwards, with groceries and rent booked as income.

The fix keeps the column when the signs agree with it one way throughout, in either direction. A file where they disagree row by row still keeps the amounts' own signs, since there's no telling which column is wrong. Three tests cover the cases and the full suite of 1379 passes.

The caveat: this is one fixture a project wrote for its own tests, not a real bank export. Real Mint files, with unsigned amounts, already worked.
