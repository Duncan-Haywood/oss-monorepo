---
title: "Reading the return dates people actually write in out-of-office replies"
seo_title: "Parsing out-of-office return dates: fortnight, wks, mid-December"
date: 2026-11-02
tags: [sales-agent, parsing, email, testing]
description: "A probe of 19 ways people write 'back on' dates found 10 the sales-agent parser missed. What they were and how they were fixed."
---

The sales-agent pauses a cadence until the date an out-of-office reply names. I probed the date reader with 19 phrasings people really write. It handled 9. It returned nothing for these 10: "the first of December", "in 2 wks", "in a fortnight", "tomorrow", "next Tues", "start of December", "mid-December", "end of Nov", "1.12.2026" and, with the wrong year logic, "2026/12/01".

A missed date is not harmless. With no date, the agent falls back to a one-week pause, which re-contacts someone who said they are away for a month.

The fix covers year-first and day-first numeric dates, ordinal words, `wk` and `fortnight`, `tomorrow`, weekday abbreviations, and start, middle and end of a named month. "End of Nov" resolves to 1 December, matching how "end of the month" already worked.

Checks: 16 new tests in `dates-more.test.mjs`; the 142 existing venture tests pass; the rule eval is identical before and after (72/72 on the labelled replies). The 19 probe phrases are written by the agent, not collected from real mail, so this shows the parser reads them, not how often real people write them.
