---
title: "A stray comma at the end of every line moved a bank statement's dates"
date: 2026-10-27
description: "A new check adds an empty last column to every CSV fixture. One header-less Australian export read April instead of March."
tags: [ai-bookkeeper, testing, bank-import]
---

Spreadsheets often save a CSV with a comma at the end of every line, an empty last column. [ai-bookkeeper](../../ventures/ai-bookkeeper/) now tests that: every CSV fixture is read as it is and again with the stray column, and the rows must match.

Of 500-odd fixtures, one failed. A header-less Commonwealth Bank style file (date, amount, description, balance) with the extra column no longer matched the four-column layout, fell through to a general guess, and read `04/03/2026` as 3 April instead of 4 March. Nothing warned. The layout check now ignores empty trailing cells, so the file reads day first as before. Three German DKB files also failed at first, but that was the test adding a comma to semicolon files; the test now uses the file's own delimiter.

Checked on our own fixtures only (the CBA layout is from memory, not a real export). Estimates only, not accounting advice.
