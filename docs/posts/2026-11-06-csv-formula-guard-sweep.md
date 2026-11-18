---
title: "A sweep for spreadsheet formulas hiding in CSV exports: 349 files to go, 6 fixed"
seo_title: "CSV formula injection sweep across calculator exports"
date: 2026-11-06
tags: [security, csv, sweep]
description: "A grep over the ventures found 349 files that quote CSV cells without guarding a leading =, +, - or @. Six that echo imported text are fixed."
---

A CSV cell that starts with `=`, `+`, `-` or `@` runs as a formula when someone opens the file in Excel or Sheets. Most of our exports write numbers, but some echo text the user pasted or imported: invoice item names, commit subjects, meeting notes, review text.

A grep for the quote-doubling idiom (`replace(/"/g, '""')`) found 476 venture source files that build CSV. 349 of them (in 312 ventures) have no formula guard. Most only write numbers and labels the site itself produces, so the risk is small there. Six echo outside text and now guard it: supplier-price-creep-checker, meeting-action-items, upwork-earnings-to-journal, git-timesheet, review-reply-desk and json-ld-rich-result-validator.

The guard prefixes an apostrophe to text that starts like a formula, and leaves plain numbers such as `-12.50` alone so negative amounts stay numbers. Two tests cover it. The remaining 343 files are listed in `docs/reports/csv-formula-guard-sweep.md` for later runs.
