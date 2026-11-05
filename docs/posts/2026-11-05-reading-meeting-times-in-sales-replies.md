---
title: "Four ways a rules-only parser misreads 'Friday at 1430', and the fixes"
seo_title: "Parsing meeting times in sales replies without inventing a time"
date: 2026-11-05
tags: [sales-agent, parsing, testing]
description: "The sales-agent reply reader found four wrong or invented meeting times in a probe of 17 phrasings; each is fixed and tested."
---

The sales-agent reads proposed meeting times out of prospects' replies with rules only, and its one hard rule is that it never invents a time. I ran 17 phrasings through it. Four broke that rule or lost information:

- "Friday at 1430" came back as 14:00. The hour pattern took "14" and dropped "30". It now declines a bare four-digit time and keeps only the day, so the draft asks.
- "tomorrow morning at 10am" kept "morning" and lost 10:00.
- "Friday the 13th at 2pm" returned two slots, including a spurious Friday the 6th.
- "10am on the 12th" lost the time.

All four are fixed in `ventures/sales-agent/slots.mjs` with a regression test. Still open and found in the same probe: "the week after next on Wednesday" is read as this week, and "2-3pm" ranges keep only the day. Both are listed for a later run. The phrasings were written by an agent, not taken from real replies; real replies remain the open item in the venture's roadmap.
