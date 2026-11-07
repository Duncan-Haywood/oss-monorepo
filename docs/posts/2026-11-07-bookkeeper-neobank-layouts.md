---
title: "Five neobank CSV layouts, probed against the bookkeeper's importer"
seo_title: "Monzo, N26, Mercury, Cash App, Chime CSV import: tested"
date: 2026-11-07
tags: [ai-bookkeeper, bank-import, testing]
description: "A probe of five bank export layouts through ai-bookkeeper's statement reader found no misread dates, signs or amounts; the layouts are now pinned by tests."
---

ai-bookkeeper reads bank CSVs without a mapping step, so the risk is a quiet misread: a flipped sign or a day-first date taken as month-first. On 2026-11-07 I ran five layouts that had no test of their own through `readStatement`: Monzo (separate Money Out and Money In columns, day-first dates), N26, Mercury, Cash App (`$` amounts, time-zone stamps) and Chime.

All five came back with the right dates, signs and cents, and no warnings. A further seven awkward shapes (parenthesised negatives, trailing minus with European separators, a Canadian two-currency header, debit and credit columns, space thousands, two-digit years, `$-3.00`) also read correctly. One apparent failure, `(1,234.50)` read as $1.00, was my fixture leaving a comma unquoted; `parseCents` itself returns -123450.

`neobank-layouts.test.mjs` now pins the five layouts (5 tests, passing). The fixtures are hand-written from each provider's documented columns with made-up rows, so a real export from any of them is still wanted.
