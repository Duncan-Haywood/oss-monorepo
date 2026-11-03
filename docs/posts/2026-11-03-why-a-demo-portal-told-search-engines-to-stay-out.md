---
title: Why a sales demo portal told search engines to stay out
date: 2026-11-03
---

The repository runs 37 checks that need no arguments. On 2026-11-03 one was red: the thin-page report found a seven-word `index.html`, the shell of the Retail Pilot Intel sales demo portal. It is a React app that draws everything in the browser, so a crawler that does not run scripts sees an empty page.

A page like that can't rank, and a sales demo meant for people who were sent a link shouldn't be in a search index anyway. The fix was one line, `<meta name="robots" content="noindex">`, which the check already treats as "deliberately unindexed". After it, `check_thin_pages.py` reports 1,334 indexable pages, median 1,036 words, none under 200, and the health run is 37 of 37.

The marketing pages for the product stay indexable; only the app shell is hidden.
