# RRULE Explainer

Free browser tool and zero-dependency CLI that shows every date an iCalendar
recurrence rule makes. Paste an `RRULE` with its `DTSTART` (and any `RDATE` or
`EXDATE`), an event, a whole .ics file, or a bare `FREQ=...` and a start, and
it gives:

- **the rule in plain English**: "Every 2 weeks on Monday and Wednesday at
  09:00 (Europe/Paris time), starting 2026-01-05 09:00, 10 times in all.";
- **each date** with its weekday and, for a zoned or UTC start, its UTC time;
  a local time that a clock change skips is read the way RFC 5545 3.3.5 says
  (with the offset before the jump, so 02:30 becomes 03:30), and a time that
  happens twice is the first one;
- **findings**: a monthly rule on the 29th to 31st that skips short months,
  with the fixed rule (`BYMONTHDAY=-1`, or `BYMONTHDAY=28,29,30;BYSETPOS=-1`);
  a rule that never fires (proved by searching a full 400-year Gregorian cycle
  times the INTERVAL); a DTSTART the rule does not make (the RFC counts it and
  python-dateutil does not); dates that change with `WKST`; BYDAY lists that
  mix `MO` with `2TU`; dates in a DST gap or overlap; COUNT with UNTIL; UNTIL of
  the wrong value type or not in UTC; and the parts RFC 5545 3.3.10 forbids for
  the FREQ.

Live: https://marisstella.app/rrule-explainer/ . Guide:
[why a recurring event skips months, or shows up twice](why-recurring-event-skips-months.html).
For file-level import errors (UID, folding, value types) use the sibling
[ICS calendar checker](../ics-calendar-check/).

## Run it

Open `index.html` in a browser; there is no build step. Tests (Node 20+):

```
node --test ventures/rrule-explainer/*.test.mjs
```

CLI:

```
node cli.mjs 'FREQ=MONTHLY;BYDAY=-1FR' --start 2026-01-30T17:00 --tz Europe/London
node cli.mjs event.ics --count 50 --json
pbpaste | node cli.mjs - --strict          # exit 1 on warnings too, for CI
node cli.mjs 'FREQ=WEEKLY;BYDAY=TU' --start 2026-01-05T09:00 --dateutil
```

Exit codes: 0 no errors, 1 errors (or warnings with `--strict`), 2 usage or
read error.

## How it is checked

`rrule.mjs` is written from the text of RFC 5545 (sections 3.3.10, 3.8.5 and
3.3.5). No library code is copied.

**Against python-dateutil.** `gen_fixtures.py` generates random rules within
what RFC 5545 allows for each FREQ (YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY,
MINUTELY; BYMONTH, BYWEEKNO, BYYEARDAY, BYMONTHDAY, BYDAY with and without
ordinals, BYHOUR, BYMINUTE, BYSECOND, BYSETPOS, WKST, INTERVAL, COUNT, UNTIL),
starts between 1990 and 2040, and records the first 20 dates python-dateutil
gives for each in `rrule.fixtures.json`. `rrule.diff.test.mjs` reads the
fixtures, so the test needs no Python. Run here on 2026-11-14 with
python-dateutil 4.0.0 on Python 3.11.18 (seed 20261114):

| group | rules | dates | engine, `flavor: "dateutil"` | engine, RFC reading |
|---|---|---|---|---|
| RFC-valid random rules | 1,500 (176 with no dates) | 21,744 | 1,500 of 1,500 identical | 1,499 of 1,500 identical |
| BYDAY mixing `MO` and `2TU` (MONTHLY, YEARLY) | 100 | 150 | 100 of 100 identical | 12 of 100 identical |

39 generated rules were left out because python-dateutil raised an error on
them ("Invalid rrule byxxx generates an empty set") or ran past a 2-second
limit; they are not in the fixtures.

The RFC reading, the default, differs from python-dateutil on purpose in
three places. The `dateutil` flavour reproduces each, so the table above
shows that the differences are only these:

1. **DTSTART.** RFC 5545 (3.8.5.3): DTSTART is always the first instance and
   counts toward COUNT. python-dateutil lists only the dates the rule makes.
   (The fixtures compare rule-made dates only, `dtstartMode: "rule"`, in both
   columns.)
2. **BYDAY lists that mix plain and numbered weekdays.** The RFC defines a
   list as matching any of its items. python-dateutil 4.0.0 requires a day to
   match a plain item and a numbered item at once, so `FREQ=MONTHLY;BYDAY=MO,2TU`
   (every Monday, and the second Tuesday) gives nothing. Of the 100 random
   rules of this shape, python-dateutil returned no dates for 92.
3. **BYSETPOS in the first week of a WEEKLY rule.** The RFC applies BYSETPOS
   to the set of instances in each week (from WKST) and then drops instances
   before DTSTART. python-dateutil starts the first week at DTSTART, so
   BYSETPOS counts from there. One of the 1,500 random rules hit this
   (`FREQ=WEEKLY;BYDAY=SU,TH,WE;BYSETPOS=1,4;WKST=TU;COUNT=18` from
   1990-05-12): python-dateutil starts with 1990-05-13, the RFC reading with
   1990-05-16; from the second week on they agree.

These are reported as differences in reading on generated inputs, not as a
claim about anyone's software in use.

**By hand** (`rrule.test.mjs`): calendar arithmetic against JavaScript's `Date`
from 1600 to 2600; week numbers against the ISO 8601 definition for 1990 to
2040; the RFC's own WKST example (`FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU`
from 1997-08-05: the 5th, 10th, 19th and 24th with WKST=MO, the 5th, 17th,
19th and 31st with WKST=SU); US Thanksgiving; the 2026 New York and Berlin
clock changes; UNTIL in UTC against a zoned start, to the second; EXDATE and
RDATE; and that every fix the tool suggests produces the dates it promises.

**Time zones** use the browser's (or Node's) `Intl` time-zone data, so
results follow the IANA database version the runtime ships. VTIMEZONE
definitions in a pasted file are not read; the TZID name is looked up instead.

## Limits

- One event: the first VEVENT's recurrence is read. Several RRULEs are
  combined as the RFC says (a union), with a note that Google Calendar reads
  one.
- EXRULE (removed in RFC 5545) is reported, not applied. RDATE periods are
  listed by their start. RSCALE and SKIP (RFC 7529) are reported and ignored.
- BYSECOND=60 (a leap second) is reported and skipped.
- A sub-daily rule (HOURLY, MINUTELY, SECONDLY) stops searching after three
  million steps; a rule that has found nothing by then is reported as such,
  not as impossible.

## Files

- `rrule.mjs`: parser, expander, time zones, English text, findings, `analyze()`.
- `index.html`, `why-recurring-event-skips-months.html`: the page and the guide.
- `cli.mjs`: the command line.
- `gen_fixtures.py`, `rrule.fixtures.json`, `rrule.diff.test.mjs`: the python-dateutil comparison.
- `usage.mjs`: anonymous local feature counters, off under Do Not Track or the opt-out.

## No warranty

Provided free and as-is, without warranty of any kind. It is not legal or
professional advice. Calendar apps and libraries read rules differently; check
the dates in the software your attendees use before relying on them.

MIT licensed. Not affiliated with or endorsed by the IETF, CalConnect, Google,
Microsoft, Apple or the python-dateutil maintainers.
