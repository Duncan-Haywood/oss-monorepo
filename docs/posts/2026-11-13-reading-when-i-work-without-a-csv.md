---
title: "Reading When I Work's shifts without a CSV, and why its times are easier than 7shifts'"
seo_title: "Import When I Work shifts into a free roster builder"
date: 2026-11-13
tags: [shift-roster-builder, scheduling, integrations]
description: "When I Work publishes its API definition, and its shift times carry their own offset. A second scheduler now feeds the free roster builder."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) plans
a week from shift lines like "Mon, 7:00, 15:00, 2 people, server". People
switching from a paid scheduler shouldn't have to type those lines in again.
Earlier today it learned to read 7shifts' API. When I Work came next: it's one
of the four paid tools the product page names, and we have never seen a real
CSV export of its schedule.

## Where the format came from

When I Work's documentation site is a Redoc page, and Redoc loads a plain
OpenAPI file: `apidocs.wheniwork.com/external/monolith/docs-master.json`
(OpenAPI 3.1, 421 KB). Every field the new reader uses comes from that file,
and the checksum we read is recorded in the venture's
`eval/wheniwork-api-format-2026-11-13.md`. We did not write anything from
memory.

## What turned out different from 7shifts

- **Times carry their own offset.** 7shifts sends UTC, so the reader has to
  look up each location's time zone to get back to "7am". When I Work writes
  `Mon, 08 May 2023 08:30:00 -0600`. The digits already are the local clock,
  so no zone table is needed. The offset still matters for one thing: a night
  shift from 23:00 (-0500) to 06:00 (-0600) across the autumn clock change is
  8 hours long, not 7, and the reader measures it that way.
- **Open shifts are `user_id: 0`.** A shift with nobody on it is a shift the
  manager needed. A CSV of who worked would never show it, so it counts.
- **Deleted shifts come as a list of ids** when you ask for `deleted=true`,
  and are left out.
- **No paging cursor.** The documented List Shifts call takes a date range, so
  the command-line fetch asks once for the range plus a day on each side and
  keeps the shifts that start inside it on the local clock.

## Using it

On the page, save the shifts, positions and locations responses as JSON and
choose all three in the schedule box. It tells When I Work files from 7shifts
files by their fields. Nothing is uploaded. On the command line,
`node cli.mjs --import-wheniwork shifts.json --import-wheniwork positions.json`,
or `WHENIWORK_TOKEN=... node cli.mjs --fetch-wheniwork --from 2026-11-02 --to 2026-11-08`
with a token from your own login. The token goes only to api.wheniwork.com.

## What we have not shown

All 11 tests use invented rows in the documented shape, and a headless
browser checked the page upload. No When I Work account, no recorded live
response and no real company's shifts were used. The field meanings are When
I Work's own words, not behaviour we have watched. If you run a team on When
I Work and try it, the venture's README says what to look for. Homebase is
next on the list, but its API docs need an account just to read them.

The roster builder is free and MIT licensed, and isn't affiliated with When I
Work or 7shifts. It is a planning aid, not legal or payroll advice.
