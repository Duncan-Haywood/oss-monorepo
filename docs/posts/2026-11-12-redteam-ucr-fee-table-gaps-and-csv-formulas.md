---
title: "A fee table with a hole in it: red-teaming the UCR fee calculator, and 203 CSV exports that run formulas"
seo_title: "UCR fee calculator: gapped fee tables now error, and a CSV formula-injection guard"
date: 2026-11-12
tags: [testing, mutation-testing, trucking, ucr, csv-injection, security, redteam]
description: "Ten faults seeded into the UCR fee calculator, six caught. A manual hunt found a gapped fee table giving a wrong price jump, hex vehicle counts, and a CSV export that would run a typed formula; 203 other exporters had the same hole."
---

The [UCR fee calculator](../../ventures/ucr-fee-calculator/) works out the
Unified Carrier Registration fee a trucking company, broker or leasing company
owes for a year. Its fee table was corrected to the 2027 schedule earlier
today. Today's red-team run seeded ten faults into its arithmetic
(`redteam.py campaign`: change one constant or comparison, run the tests, put
the file back) and then read the code as someone trying to get a wrong answer
out of it.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `ucr-fee-calculator/calc.mjs` | 10 | 6 | 1 | 9 of 9 |

The three escapes that mattered: no test had brackets that share an edge
(`0-2` and `2-5`), so loosening the overlap check went unseen; no test had a
one-truck carrier, so dropping its per-vehicle figure went unseen; and no test
had a carrier in the open top bracket (1,001+ trucks), where a flipped `&&`
would crash the page. The fourth escape changed the fee on a row that is only
ever returned as an error, so nobody can see it.

## Three wrong answers a stranger could get

**A fee table with a gap.** The fee table is editable so a visitor can paste
the year's numbers from ucr.gov. Paste `0-2: 55` and `6-20: 333` (a missed
line) and the tool used to say a two-truck carrier was "at the top of the 0-2
bracket; adding one vehicle moves the fee up $278.00". No bracket covers three
trucks, so that number is made up. The table now has to cover every count:
"Fee table has a gap: no bracket covers 3-5 vehicles."

**Vehicle counts that aren't numbers.** Counts went through JavaScript's
`Number()`, so `0x10` became 16 trucks and `1e3` became 1,000. Counts must now
be plain digits (spaces and underscores still work as thousands separators).

**A CSV that runs code.** "Download CSV" wrote the registrant name exactly as
typed. A name starting with `=`, `+`, `-` or `@` is a formula to Excel and
Google Sheets, and a `=HYPERLINK(...)` cell can send whatever the sheet holds
to someone else's server (CSV injection, CWE-1236). Such cells now get a
leading apostrophe, which spreadsheets show as text. Plain numbers, negative
ones included, are left alone.

## The same hole in 203 other tools

Then we checked the other exporters. 235 venture files define a `toCsv`; 32
already defuse formula characters and 203 don't. Their shapes differ too much
to patch with one search-and-replace, so the run added
`platform/ci/check_csv_formula_guard.py`. It lists today's 203 in a baseline
file and fails on any new exporter without the guard. It also fails when a
listed file has been fixed and its line is still there, so the list can only
get shorter. Each venture fixed from here on deletes one line.

The record of the run, with every mutant and its triage, is in
`prompts/runs/2026-11-12-session_01EhTJVLvbwqRYpdZZJmbrxV.json`.
