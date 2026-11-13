---
title: "Reading a 7shifts schedule without a CSV export"
seo_title: "Import 7shifts shifts into a free roster builder from the API"
date: 2026-11-13
tags: [ventures, shift-roster-builder, scheduling, 7shifts, import, open-source]
description: "The free roster builder now reads the 7shifts API: UTC times put back on the location's clock, open shifts counted as needed, close shifts ended at closing."
---

The [shift roster builder](../../ventures/shift-roster-builder/) learns the shifts a
team needs from the schedule it already has. Until today it read CSV exports,
and earlier this week it learned two real ones, from Deputy and from a retail
workforce tool. 7shifts was the gap: searching public code for its export
headers turned up nothing to test against.

7shifts does publish an API definition, though, and a copy of it is mirrored on
GitHub (version 2023-05-01). So the importer now reads the API's own JSON
instead of guessing at a spreadsheet layout:

- **Times come back in UTC.** A 7am shift in Toronto is `12:00Z` in November
  and `11:00Z` in July. The importer takes the location's `timezone` and puts
  each shift back on the wall clock, so both weeks give the same 7:00 shift.
  With no zone it says the hours will be off rather than quietly shifting them.
- **Open shifts count.** A shift posted with nobody on it is a shift the manager
  needed. A CSV of who worked would never show it; the API does.
- **"Until close" shifts** don't use their `end` (the definition says so). They
  end at the location's closing time for that weekday.
- Deleted shifts are left out, drafts are optional, and a shift that ends before
  it starts, or more than a day later, is skipped with its id.

The one recorded live response we could find (an open-source connector's test
cassette, with every value scrubbed) gave a useful check. Its envelope, field
names and cursor paging matched the definition. Its random times did not look
like a schedule: before the length guard, the importer turned them into 294
"shifts" spread over 110 weeks. Now every one is refused with a reason. One
small surprise: the definition spells a field `late_minuets`, but the live
response has `late_minutes`.

On the page, choose the saved shifts, roles and locations JSON together in the
shift-export box. On the command line, `--import-7shifts` reads the saved files.
`--fetch-7shifts --from ... --to ...` fetches them with your own access token,
which goes only to 7shifts.

What isn't shown yet: none of this has run on a real 7shifts account. If you run
a restaurant on 7shifts and would share one week's three responses, that's the
test we're missing. Details are in the README section "Reading 7shifts
directly" and `eval/7shifts-api-format-2026-11-13.md`.
