---
title: "A vendor named =HYPERLINK() in your 1099 file"
seo_title: "CSV formula injection in bookkeeping exports: the 1099 and tax-pack gap"
date: 2026-11-06
tags: [ai-bookkeeper, security]
description: "ai-bookkeeper's journal export already defused spreadsheet formulas, but its 1099, Schedule C, rental, project and depreciation CSVs did not. Now they share one cell writer."
---

Payee names in ai-bookkeeper come straight from bank files, and a bank file is text anyone who can pay you controls. A payee called `=HYPERLINK("http://example.test","click")` would open in Excel as a live link in the 1099 contractor list.

The journal export already put an apostrophe in front of cells starting with `= + - @`, tab or CR. The tax-pack CSVs (1099 contractors and filing sheet, Schedule C, Schedule E, project P&L, tax depreciation, and the pack's own statements) each kept a private copy of an older quoting helper that did not. They now share `csvq.mjs`. In the pack's statements, amounts stay bare so a negative balance is still a number.

Checked with new tests (`csvq.test.mjs`) and the existing tax suites: 55 tests pass.
