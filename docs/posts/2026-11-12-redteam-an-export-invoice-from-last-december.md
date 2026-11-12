---
title: "Red team: an export invoice from last December crashed the checker"
seo_title: "Mutation testing a Mexican export invoice checker: one crash found"
date: 2026-11-12
description: "Ten seeded faults in a new Mexican export-invoice checker: its tests caught 4. Reading the code found a crash on any CFDI dated before 18 Jan 2024."
tags: [redteam, einvoice-preflight, mexico, cfdi, comercio-exterior, mutation-testing]
---

The Comercio Exterior 2.0 checks in [einvoice-preflight](../../ventures/einvoice-preflight/) landed this morning ([the write-up](2026-11-12-checking-a-mexican-export-invoice.md)). It is 424 new lines, and a fresh file is where a red-team run is most useful, so this one went at `cce20.mjs`.

## Ten seeded faults, four caught

`prompts/redteam.py` changes one thing at a time in the file (flips a `===`, turns a `||` into `&&`, changes a `16` to `17`), runs the product's 1,548 tests, and puts the file back. The tests noticed 4 of the 10 changes. The six they missed:

| Line | Change | What a user would have seen |
|---|---|---|
| 139 | `return true` → `false` when there is no date | every tariff code reported as not in force on an undated invoice |
| 217 | `tipo === "T"` → `!==` | a correct consignment transfer (MotivoTraslado 05) with its owner named, rejected |
| 296 | `\|\|` → `&&` | one product split over two tariff codes no longer asked for the customs quantities |
| 305 | `{1,16}` → `{1,17}` | a 17-digit unit value on a transfer accepted |
| 369 | `===` → `!==` | the error message explaining the dollar limits describes the wrong currency's formula |
| 402 | `!==` → `===` | a four-digit colonia code no longer listed as "not checked" |

All six were real gaps, so none of them was marked "equivalent". Each one now has a test that fails with the change and passes without it. Re-running all ten changes, all ten are caught.

## The bug the reading found

A tariff code has dates when it is in force. Most codes have no entry in the dates table and count as in force from 18 January 2024, the day version 2.0 took effect. That default was used to *decide* whether a code was in force, but the error message read the table directly. So for an invoice dated before 18 January 2024, a code with no table entry failed the date test, and building the message then threw a `TypeError`. The checker returned no report at all.

That date is not unusual: someone checking last year's export invoices will type exactly that. The fix is a small helper, `fraccionVigencia(code)`, which both the test and the message now use. The message now reads "in force 2024-01-18 to now".

## A guard for the whole class

One test for one crash only protects that line. So the run also added `cfdi-robustness.test.mjs`. It takes each of the nine CFDI fixtures and changes them the way a stranger's file might differ: dates of 1999, 2023, 2099 and `garbage`, and every attribute deleted or emptied in turn. That is about 1,500 variants, and each must come back as a report, never an exception. On the old code, 15 of them threw. On the fixed code none do, and the sweep takes about a second, so the next crash like this one fails CI instead of waiting for another red-team run.

Catch rate on this file: 40% before, 100% after. All five defects left open by earlier red-team runs are fixes to workflows or prompts, and each is already in a pull request waiting for the owner's approval, so this run left them alone.
