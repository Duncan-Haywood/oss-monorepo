# GTFS Feed Check

Free GTFS Schedule feed checker for small transit agencies, campus and
demand-response shuttles, and the vendors who build their feeds. Drop the
GTFS zip your scheduling software exported and get every problem with its file
and line: missing files and fields, trips pointing at routes, stops or
services that do not exist, stop times that run backwards, the date your
service runs out, impossible speeds between stops and swapped coordinates.
The zip is opened in the browser and never uploaded.

**Live tool:** https://marisstella.app/gtfs-feed-check/
**Every check explained:** https://marisstella.app/gtfs-feed-check/gtfs-errors-explained.html

## Run it

Open `index.html` in a browser (served over http, since it loads ES modules).
There is no build step, no account and no API key.

Tests (Node 20 or newer):

```
node --test ventures/gtfs-feed-check/*.test.mjs
```

## Check a feed in CI

`cli.mjs` is the same engine for a terminal or CI job, with no dependencies.

```
node cli.mjs gtfs.zip                     # exit 1 if there are errors
node cli.mjs gtfs.zip --strict            # warnings fail too
node cli.mjs gtfs/ --json                 # a folder of .txt files
node cli.mjs gtfs.zip --csv > findings.csv
node cli.mjs gtfs.zip --today=2026-12-01  # judge expiry against another day
```

Exit codes: 0 no errors, 1 findings at the failing level, 2 usage or read error.
TriMet's feed (2.6 million stop times, 210 MB unzipped) checks in about 8 s.

## What it checks

Required files; files at the zip root; case of file and field names; CSV shape
(RFC 4180); every value's type (times past 24:00, dates, colours, IANA time
zones, URLs, emails, language codes, coordinates, enums); primary keys;
references between agencies, routes, trips, stops, shapes and services; parent
station rules; stop times in stop_sequence order (times at both ends, never
going backwards, arrival before departure, shape distance never decreasing);
frequencies that overlap; the first and last service date, under 7 and under 30
days left, days in the next 30 with no service; feed_info dates against the
calendar. Sanity limits the reference does not set, each labelled as this
tool's: straight-line speed per mode, stops far from the rest, platforms far
from their station, route colour contrast below 3:1.

Not yet: fares (v1 and v2), transfers, pathways and levels, flex
(locations.geojson, booking rules), translations, stops far from their
trip's shape, block overlaps. The MobilityData GTFS Validator is the complete
rule set; use it before submitting a feed.

**Spec sources.** The GTFS Schedule Reference, revised 2026-04-27
(gtfs.org; `google/transit` repository, `gtfs/spec/en/reference.md`), read on
2026-11-19. The professional who would sign this off is a transit data
specialist or GTFS feed producer. `calc.test.mjs` pins the reference's own
examples (Time `25:35:00`, Date `20180913`, Color `0039A6`, the quoted-CSV
example, the 24:00:00 block example, the 7- and 30-day publishing practice)
and hand calculations (one degree of latitude, WCAG black-on-white 21:1,
10 km in 2 minutes = 300 km/h). `eval/real-feeds-2026-11-19.md` records what
it found on four real feeds.

## Files

- `index.html`: the tool. `gtfs-errors-explained.html`: every finding code.
- `calc.mjs`: the rules. `zip.mjs`: a dependency-free zip reader (inflates
  with the platform's `DecompressionStream`).
- `cli.mjs`: the command line. `usage.mjs`: anonymous local usage counters.
- `eval/real-feeds.mjs`: runs the engine over real feeds and prints Markdown.

## Privacy

Everything runs in your browser. The feed is never uploaded; there are no
accounts, cookies or analytics vendors. Anonymous feature counts
(`feed_checked`, `example_loaded`, `findings_downloaded`) stay in local
storage on your device and can be turned off on the page.

## License

MIT. See `LICENSE`. No code from other GTFS validators was used; the rules
were written from the reference text.

## No warranty

This tool is provided free and as-is, without warranty of any kind. It is not
legal, regulatory, engineering or professional advice, and it does not replace
any trip planner's own validation. You are responsible for reviewing and
verifying its output before relying on it; a clean result is not a promise
that any app accepts the feed. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.
