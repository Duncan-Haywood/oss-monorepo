---
title: "The league scheduler now reads 25/12/2026 and 25 Dec 2026"
seo_title: "Round robin league scheduler with UK, European and Australian date formats"
date: 2026-11-05
tags: [league-schedule-generator, dates, locale]
description: "Blackouts and season dates in the free league schedule generator now accept day-first dates, dotted European dates and month names."
---

The league schedule generator took dates as `YYYY-MM-DD` or US `M/D/YYYY`. A netball or five-a-side organiser in the UK, Australia or Germany types `25/12/2026` or `25.12.2026`, and got "not a date".

It now reads those, with one rule so nothing changes silently:

- `25/12/2026`: the first number is over 12, so it can only be the day. Read as 25 December.
- `5/6/2026`: could be either. It stays month first (5 June), as before.
- `25.12.2026`: dotted dates are day first everywhere they are used.
- `25 Dec 2026`, `1st September 2026`, `Dec 25, 2026`: month names are never ambiguous.

Ranges work in any of these (`24 Dec 2026 to 2 Jan 2027`). Tested in `calc.test.mjs`, including an impossible date (`31/04/2026`) that is refused.
