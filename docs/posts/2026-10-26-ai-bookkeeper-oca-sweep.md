---
title: "Two more bank-file faults found by reading someone else's test files"
date: 2026-10-26
description: "ai-bookkeeper's bank reader had only ever been checked against layouts we wrote ourselves or learned from other projects. This run swept the CSV and QIF..."
tags: [ai, ventures]
---

ai-bookkeeper's bank reader had only ever been checked against layouts we wrote ourselves or learned from other projects. This run swept the CSV and QIF fixtures of OCA's bank-statement-import project (cloned at run time, nothing copied) through it.

Two faults came out. A file with a `D/C` flag column beside an unsigned amount kept the file's own signs, so a credit written as `-1,533.50` stayed negative while the file's balance column said money came in. And a `Label` column was not recognised as the description, so a file with both Label and Detail columns showed the Detail text and dropped the bank's label.

Both are fixed in `bank.mjs` with three tests, and the README's Next list records what the sweep covered. The pattern keeps paying: each foreign corpus finds one or two header or sign conventions that no hand-written fixture would have.
