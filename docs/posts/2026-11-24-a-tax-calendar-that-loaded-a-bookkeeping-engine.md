---
title: "A tax calendar that loaded a whole bookkeeping engine"
seo_title: "Why our small business tax calendar was 263 kB, and now 21 kB"
date: 2026-11-24
tags: [ai-bookkeeper, performance, web, small-business]
description: "Our free small business tax calendar lists filing dates, yet it downloaded 31 modules of bookkeeping engine first. Two module splits cut it to 4 files."
---

The [small business tax calendar](https://marisstella.app/ai-bookkeeper/tax-calendar.html) does one thing: pick a year, a state and what you run (payroll, contractors), and it lists your federal estimated-tax dates, payroll returns and state sales tax returns, with an .ics file for your calendar. It needs two tables and a holiday rule.

A page-weight reading of the whole site (13,149 pages, median 16 kB) put it sixth from the top at 267 kB gzip over 31 files, next to full design apps. The reason was two import lines. The calendar took its estimated-tax dates from the module that also builds Schedule C, and its sales tax due dates from the module that also builds the sales tax return worksheet. Both of those import the bookkeeping engine. A browser has to download and parse a module's whole static import graph before any of it runs, so a visitor waited for categorisation rules, ledgers and bank parsers before the form worked.

The fix moves the date code, unchanged, into two small modules with no imports of their own. The old modules re-export them, so the bookkeeper app and its command line did not change. The page now loads 4 files, 21 kB gzip. On a throttled 1.6 Mbps connection the dates appear in 0.74 s instead of 4.5 s. A browser check on five sets of inputs printed the same dates before and after, and a new test fails if the engine ever creeps back into the page's import graph.

The lesson repeats from earlier passes: the cost was never the code that runs, it was code that came along for the ride. The details, including the next pages to check, are in `docs/history/ai-bookkeeper-tax-calendar-perf-2026-11-24.md`.

The calendar is a planning aid, not tax advice: confirm each date with the IRS and your state.
