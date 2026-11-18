---
title: "0x10 is not sixteen pesos: a red-team pass on the CFDI checker"
seo_title: "CFDI 4.0 amounts: why Number() is the wrong parser for an e-invoice"
date: 2026-11-12
tags: [einvoice-preflight, redteam]
description: "JavaScript's Number() reads 0x10 as 16 and a blank as 0. The CFDI checker summed those values, then blamed correct totals. Two fixes and four new tests."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) checks Mexican CFDI 4.0 invoices before they go to a PAC for stamping. Its CFDI reader landed this week, so today's red-team run aimed at it. The run did two things: it planted eight small bugs in the checker to see whether the tests would notice, and it looked for inputs that give a wrong answer.

## Planted bugs: 5 of 8 caught

The tests caught five of the eight planted bugs. Three got through:

- One changed how many characters the checker reads (4096 became 4097) when it decides whether a file is a CFDI at all. Nothing pinned that window.
- One counted an unreadable line tax amount as 0 instead of setting it aside, so a correct tax summary would be blamed for disagreeing with it.
- One made the "lines carry taxes but there is no tax summary" rule (MX-032) fire only when the lines carried two or more kinds of tax. The sample invoice has IVA and a withholding, so a one-tax invoice was never tried.

Each now has a test that fails when the bug is planted, so all eight are caught.

## A real bug: what counts as a number

The checker parsed amounts with JavaScript's `Number()`. That function is generous in ways an invoice schema is not:

| Attribute value | `Number()` reads | The CFDI schema |
|---|---|---|
| `0x10` | 16 | not a number |
| `1e3` | 1000 | not a number |
| `" "` (a blank) | 0 | not a number |

The schema check already named those values (rule MX-003). But the arithmetic rules ran on the `Number()` reading. A line `Importe="1e3"` on an 850.50 line meant the line amounts summed to 4000.00, and the report also said the correct `SubTotal` of 3850.50 was wrong. A tax `Base=" "` produced four findings, three of them pointing at amounts that were fine.

The fix parses amounts with the same decimal pattern the schema check uses, after trimming the spaces XML Schema allows. A value that pattern rejects now gets its MX-003 finding and is left out of the sums.

## And one about spaces

`Total=" 3848.58 "` is valid: `xs:decimal` collapses whitespace. But the decimal-places check counted the trailing space and reported "Total has 3 decimals; MXN allows 2." It now trims first.

## The sibling readers were fine

The Polish KSeF FA(3) and Italian FatturaPA readers parse amounts the same loose way. Both already reject `0x3E8` and `1.32e3` with their own "is not a number" findings, so the bug was only in the CFDI reader.

The run record, with every planted bug and its test, is in `prompts/runs/2026-11-12-session_01XpHqydMjERz1Nc37bBuioX.json`.
