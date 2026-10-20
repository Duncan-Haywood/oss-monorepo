# Translation Job Picker

Accepting requests as they arrive, or the biggest fee first, fills a solo translator's calendar with the wrong files.
Paste the queue on offer (fee, hours of work, the business day each is due, direct cost) and get the exact set of
files with the highest total net that can still be delivered on time, the order to work them, the fee at which each
declined file would earn a place, and what first-come, biggest-fee and best-per-hour acceptance leave behind. Browser
page or zero-dependency CLI. Works for editors, transcribers and any solo professional paid per job with fixed due dates.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/translation-job-picker/

```
node cli.mjs pla jobs.csv --hours-per-day 6 --booked 4 --booked-due 2 --json
cat jobs.csv | node cli.mjs plan - --hours-per-day 7
```

Input: rows of `name,fee,hours,due_day,direct_cost[,note]`. See `fixtures/jobs.csv`.

## How it decides

Net per file is fee less direct cost. Work is divisible across days and you have `hours-per-day` of it each business
day, minus any hours already booked. A set of files is deliverable exactly when, for every due day, the hours of the
accepted files due by then fit in hours-per-day times that day (earliest-due-date order is optimal for divisible work).
The best set is found exactly by a depth-first search over the files in due-date order, abandoning a partial set the
moment a deadline is missed; the tests check it against every subset. A declined file's break-even fee is exact: its fee
plus the gap between the best total and the best total forced to include it.

## What it is not

Not a forecast and not a scheduler of calendar appointments: one person, one stream of hours, business days counted by
you, up to 16 files. A file that must be done in one sitting, a second translator, changing rush add-ons and client
relationships are not modelled. Not financial, legal or business advice, no warranty. It does not know your language-pair
competence, certification, confidentiality or agency terms; those come first.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
