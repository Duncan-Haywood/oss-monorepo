---
title: "ai-bookkeeper: two more checks that a bank file's layout can change without changing the books"
date: 2026-10-27
description: "An unused column, or a signed amount split into debit and credit columns, must not change what ai-bookkeeper reads. Both hold on every fixture."
tags: [ai-bookkeeper, testing, bank-import]
---

Banks add columns without warning. [ai-bookkeeper](../../ventures/ai-bookkeeper/) now has a test that inserts an unused column at the front and in the middle of every rectangular, headered CSV fixture and checks the rows read are identical. A second test rewrites a single signed Amount column as Debit and Credit columns and checks the same.

Neither found a fault, so they pin behaviour. The debit/credit check only applies to one fixture today, because files with a type column carry their sign there and are skipped. Real exports are still the missing input: these checks use the repository's own fixtures. Estimates only, not accounting advice.
