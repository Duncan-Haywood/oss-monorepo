---
title: "Six real Dutch MT940 layouts, one bank's markers leaking into descriptions"
seo_title: "Six real Dutch MT940 layouts and a bank's leaking markers"
date: 2026-10-26
description: "We ran six MT940 statements from a public test folder (ABN AMRO, ING, KNAB, Rabobank, SNS, Triodos; real layouts, made-up rows) through ai-bookkeeper's..."
tags: [ai, ventures]
---

We ran six MT940 statements from a public test folder (ABN AMRO, ING, KNAB, Rabobank, SNS, Triodos; real layouts, made-up rows) through ai-bookkeeper's reader. Five came out right, including ABN AMRO's 65-column wrapped references and ING's invisible soft hyphens inside dates.

Triodos was the exception. It writes the structured part of each description as `000>10..>20..>21`, using `>` where German banks use `?`. The reader only knew `?`, so descriptions kept the raw `>20` markers and the account number. It now reads both, and a payee line comes out as `HUUR KANTOOR - FEB 2010`.

One rough edge remains: the bank cuts text at 27 characters mid-word, so a word can show a gap (`KOS TEN`). We have no current real export from these banks, so this is a layout check, not a field test.
