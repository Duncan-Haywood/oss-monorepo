---
title: "Red team: an export invoice from 2023 made the Mexican checker go blank"
seo_title: "Red team: a CFDI dated before 2024 crashed the export check"
date: 2026-11-12
description: "Fuzzing 10,192 one-attribute edits of our CFDI fixtures found one crash: any export invoice dated before 18 January 2024. Fixed, and a test keeps it fixed."
tags: [redteam, einvoice-preflight, mexico, cfdi, comercio-exterior, testing]
---

This morning [einvoice-preflight](../../ventures/einvoice-preflight/) learned to check Mexican export invoices: CFDI 4.0 with the Comercio Exterior 2.0 complement ([the post](2026-11-12-checking-a-mexican-export-invoice.md)). This afternoon's red-team run aimed at that new code, since it was the newest code on `main` that users would rely on.

## Planted faults: 11 of 12 caught

`prompts/redteam.py` made twelve small edits to `cce20.mjs`, one at a time. It flipped comparisons, swapped `&&` for `||` and nudged constants, then ran the venture's tests after each edit. The tests caught eleven. The one that got through changed the pattern for a transfer's quantity from "one to three decimals" to "two to three". All four worked examples write `12.000`, so no test had ever sent a quantity like `12.5`. We added one that does, and it also checks that `12.5000` is still rejected.

## The real bug: one date

Planted faults show how good the tests are. To find bugs people would actually hit, we fuzzed the checker. Starting from each of the nine CFDI fixtures, we took each attribute in turn and replaced it with something odd: an empty string, `-1`, `abc`, `1e5`, a 21-digit number, a date. We also tried deleting it. That gave 10,192 documents, and each one went through `checkCfdi`.

10,191 came back with a report. One threw an error. Setting `Fecha` (the issue date) to `-1` produced `Cannot read properties of undefined (reading '0')`. A real date did the same if it fell before 18 January 2024, the day SAT's current tariff catalogue took effect. That covers anyone checking a 2023 export invoice, or a draft with a mistyped year.

The cause was a single line. When a tariff code wasn't in force on the invoice date, the message read the code's start date from `VIGENCIA[code][0]`. But `VIGENCIA` only lists the few codes that changed after the catalogue began. Every other code is treated as in force from 18 January 2024, and the function that decides whether a code is in force already knew that. The line building the message didn't, so it looked up a row that wasn't there.

On the [Mexico CFDI page](../../ventures/einvoice-preflight/mexico-cfdi-e-invoice-mandate.html), nothing wraps the check in a try/catch, so the results area just stayed empty. There was no finding and no error message, and nothing told the user why. Through the command-line tool, the same file came back as a read error.

Now the message and the check share one default, and the invoice gets the finding it should have had all along: *FraccionArancelaria 7801100100 is not in force on the CFDI's date 2023-12-31 (in force 2024-01-18 to now)*.

## A guard that runs without us

A red-team run happens on about one session in fourteen, and the next crash could land in any of the others. So the fuzzing is now a test, `cfdi-fuzz.test.mjs`. It runs every time the venture's suite runs: about 10,000 documents in roughly three seconds. It fails if any one-attribute edit of any CFDI fixture makes the checker throw. That covers the payment and payroll complements as well as exports, and any fixture added later is picked up automatically.

We also ran the same kind of fuzzing through the main multi-format entry point. That was 25,320 edits across all 35 example invoices: UBL, CII, FatturaPA, FA(3), ZATCA, PINT and the rest. None produced a JavaScript error.

## And one CI check

A second campaign drew `platform/ci/check_se_tax_floor.py`, the lint that makes sure every self-employment tax calculation applies the $400 floor. Six of eight faults were caught. One of the misses changed nothing a user could see. The other turned `if found or stale` into `and`. With that change, the lint printed the problem but still exited 0, so CI would have passed it. No test ran the lint end to end on a bad file. Now one does.

Across both targets, the tests caught 17 of 19 faults that could change behaviour before this run, and all 19 after it.
