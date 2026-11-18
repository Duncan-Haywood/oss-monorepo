---
title: "Reading Deputy rosters when Deputy's API docs won't load"
date: 2026-11-17
tags: [scheduling, shift-roster-builder, integrations, open-source]
description: "Shift Roster Builder now reads Deputy rosters straight from its API. The field names came from two open-source clients, checked against their own fixtures."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) could already
read shifts straight from 7shifts, When I Work and Square, using each vendor's
published API definition. Deputy was the odd one out. Its CSV timesheet export
was read from a real file on 13 November, but every session that tried
Deputy's API reference got nothing back, so an owner leaving Deputy had to
export a file first.

Today's session couldn't reach the reference either: `developer.deputy.com`
and `www.deputy.com/api-doc` both failed to connect. Two open-source clients
for that API could be cloned, though:

- an MIT-licensed PHP wrapper whose schema types a roster's `StartTime` and
  `EndTime` as Unix timestamps, and whose mock client returns full roster
  and area records;
- Google's Apache-2.0 Python client, which shows the request body
  (`search`, `join`, `start`, `max: 500`), the 500-row page cap and the
  `Authorization: OAuth` header.

The new reader was written from those field names. None of their code was
copied.

## What a Deputy roster says

A roster is one shift. It carries Unix times, and sometimes the same times
"localized", with the site's offset written in:

```
"StartTime": 1514759400,
"StartTimeLocalized": "2018-01-01T09:00:00+10:30",
"Date": "2018-01-01T00:00:00+10:30",
"OperationalUnit": 983, "Employee": 1, "Published": true, "Open": false
```

The wrapper's two mock rosters are consistent with each other.
1514759400 is 22:30 UTC on 31 December, which is 09:00 at +10:30 (Adelaide)
on 1 January, matching the localized field. So the reader takes the time in
this order:

1. the localized time, read on the site's own clock;
2. the Unix time in a time zone you name (`--tz`);
3. the Unix time at the offset of the roster's own `Date`;
4. UTC, with a note saying so.

Option 3 is only an hour off for a shift that starts after a daylight-saving
change on the same day. The test strips the localized fields from the mock
roster and gets the same 9:00 to 11:00 back.

Deputy's "area" (operational unit) becomes the role. That's how the CSV
reader already treated Deputy's `Area Name` column. The area's company
becomes the location. An open roster, or one with `Employee: 0`, still counts
as a shift that needs a person. Drafts are counted unless `--no-drafts` is
given.

## Using it

```
DEPUTY_INSTALL=yourco.na.deputy.com DEPUTY_TOKEN=... \
  node cli.mjs --fetch-deputy --from 2026-11-02 --to 2026-11-08 --save deputy.json
node cli.mjs --import-deputy deputy.json
```

The token is only ever sent to a `*.deputy.com` address. On the page, the
saved JSON goes in the same schedule box as the other vendors' files, and
Deputy's JSON is recognised by its capitalised `StartTime`.

## What isn't known

No Deputy account, token or real response was used. The field names come
from third-party clients, not from Deputy's own reference. If Deputy has
renamed a field since those clients were written, this reader will miss it,
and a real install is the test that would show it. Meal breaks, leave and
wages aren't read yet. The wrapper's employee-agreement model has a
`baseRate`, so staff and wages are the next piece that can be built without
an account. Details: `eval/deputy-api-format-2026-11-17.md`.

*A planning aid, not legal or payroll advice. Not affiliated with Deputy.*
