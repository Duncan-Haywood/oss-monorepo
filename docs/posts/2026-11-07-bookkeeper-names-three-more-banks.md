---
title: "ai-bookkeeper now names Navy Federal, Truist and TD Bank exports"
seo_title: "ai-bookkeeper: Navy Federal, Truist, TD CSV recognised"
date: 2026-11-07
tags: [ai-bookkeeper, bank-import]
description: "Three US checking layouts already imported correctly but showed up as an unknown bank. The importer now labels them, and the tests pin it."
---

ai-bookkeeper's CSV reader matches columns by meaning, so Navy Federal, Truist and TD Bank exports (Debit, Credit and Balance columns) have imported correctly since 2026-11-04. They were reported as "unknown bank", though, so the page could not say which layout it had read. `sniffBank` now returns `navy-federal`, `truist` and `td-bank` from each header row.

The three headers are close to each other and to existing rules, so each pattern is anchored on its distinguishing column (Posting Date, Check Number, Check No). The full suite of 2,371 tests passes, with the three fixtures now asserting the names.

Caveat: the headers are from memory and the rows are made up. No real download from these banks has been tried, so the names are informational only. A real export is still the thing to check them against.
