# Time ranges as patterns, and 24:00:00 as a time (2026-11-21)

**Question.** IfcTester 0.9.0 casts IDS range bounds to float, so it fails
every object on a date, dateTime or time range. The editor's **Write as a
pattern** covered `xs:date` (2026-11-20) and `xs:dateTime` (2026-11-21,
eval/datetime-pattern-2026-11-21.md) but not `xs:time`, the base IDS 1.0's
DataTypes table gives IFCTIME (`Pset_WorkControlCommon.WorkStartTime` and
`WorkFinishTime`: "work starts between 07:00 and 09:00"). Can one XSD pattern
pass exactly the times this checker passes on a time range?

## A checker fix first: 24:00:00 is 00:00:00

XSD (1.0 and 1.1) allows `24:00:00` as a time and gives it the value
`00:00:00`: a time has no next day to roll into. This checker read a time by
placing it on 1970-01-01 with `Date.parse`, which turns `24:00:00` into
1970-01-02T00:00Z, so a time of `24:00:00` passed no range of times of day
(it failed `>= 00:00:00 and <= 01:00:00`). `temporalKey` now reads
`24:00:00` (and `24:00:00.0...`) as `00:00:00` for times only; a dateTime's
`24:00:00` is still the next day's midnight, as XSD has it. `24:00:01` and
`24:00:00.5` are still not times. One consequence: a range from
`23:59:59.999` to `24:00:00` is empty (its top is the start of the day), as in
XSD.

## How the checker orders times (ids.mjs, temporal.mjs)

A time is placed on 1970-01-01, no zone is UTC, and instants are compared
(with the whole fraction since 2026-11-21, `temporalCompare`). That is XSD
1.1's timeOnTimeline on its reference day, and it is not modular:
`03:00:00+05:00` is 22:00 UTC the day *before*, so it fails `>= 00:00:00`;
`23:30:00-01:00` is 00:30 UTC the day after, so it fails `<= 01:00:00`.

## What changed

- `temporal.mjs`: `timeRangePattern(r)`. For each UTC offset time zones use
  (the same 44 as the dateTime pattern, plus no zone, `Z` and `-00:00`), the
  local clock times whose instant lies in the range are one window of the
  day, written with `timePat` (hours 00-23, minutes and seconds 00-59, the
  fraction to the bound's own digits); offsets with the same window share
  one alternative. `24:00:00(\.0+)?` joins any window that passes
  `00:00:00`. Clock times that pass for every offset up to +-23:59 are
  written once with any zone; so a value with an offset no zone uses
  (`+10:17`) passes only there, and near a bound the pattern refuses what
  the range takes (never the other way).
- `editor.mjs`: `timePattern(min, max, minEx, maxEx)`; `editor.html` shows
  **Write as a pattern** on time ranges ("write the same times as a
  pattern"), where it used to say only "ask for a pattern on the date".

## Measured

```
node --test time-pattern.test.mjs
node eval/time-pattern.mjs OUT.ids OUT.ifc             # eval/time-pattern.txt
python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc   # eval/time-pattern-ifctester.txt (ifcopenshell 0.9.0.post1, ifctester 0.9.0)
node eval/time-pattern-page.mjs                        # eval/time-pattern-page.txt (Chromium)
```

Unit test (`time-pattern.test.mjs`): 24 ranges (12 written, 12 random;
one-sided and exclusive bounds, bounds with zones from +14:00 to -12:00 and
with fractions past the millisecond, `24:00:00` as a bound), each compared
with the range through this checker's own XSD regex reader at 39 offsets
(0, 1 ms ... a day) from each bound and from 00:00, 12:00 and 23:59:59.999,
in every zone in use plus no zone, `Z` and `-00:00`, each written up to
eight ways (fractions of 1, 2, 3, 4 and 7 digits, none, `24:00:00`): over
100,000 strings, 0 differences; five offsets no zone uses never pass what
the range refuses; 16 malformed strings refused alike. Three mutations
(drop the `24:00:00` alternative, keep a bound's sub-millisecond tail where
the day clips it, let the any-zone part take hour 24 and minute 60) each
fail the test.

32 work schedules, each with one `Pset_WorkControlCommon.WorkStartTime`
(IFCTIME) on the edges above, against 10 time ranges and the pattern the
editor writes for each:

| check | result |
|---|---|
| schedule verdicts unlike the range, zones in use | 0 of 300 |
| schedule verdicts unlike the range, `+10:17` | 9 of 20 (the pattern refuses, the range passes) |
| IfcTester 0.9.0 on the range | fails 32 of 32 schedules on all 10 ranges |
| IfcTester 0.9.0 on the pattern vs this checker | same failing schedules, 10 of 10 specs |
| pattern length | 2,048 to 6,676 characters |

`+10:17` misses more often here than on dateTimes (3 of 20) because a
time-of-day range is narrower than a day, so no clock time passes for every
offset up to +-23:59; only ranges wider than about two days of instants
(bounds with opposite extreme zones) have an any-zone part. No real time
zone has used such an offset since 2000.

Page (Chromium, 390 px): an opened IDS asking a schedule's start time to be
07:00 to 17:00 shows the IfcTester warning and the button; the downloaded
file has a 3,675-character pattern and no range left, and both checkers'
verdicts match the range: 12:30:00+05:30 (07:00 UTC) passes, 17:00:00.001
fails; no horizontal scroll, no page errors.

## Not done

- Durations still have no pattern: a duration range orders months as
  30.44 days, which no pattern can follow.
- None of the 65 real public IDS files (`eval/fetch-audit-corpus.sh`) has
  an `xs:time` range; buildingSMART's IDS-Audit-tool test file
  `ValidFiles/RichFile.ids` has four (`<= 03:06:12`, `< 03:06:12+01:00`,
  `>= 18:06:12+01:00`, `>= 18:06:12-01:00`), and each gets a pattern (2,593
  to 4,312 characters). So this is built from IDS 1.0's DataTypes table,
  IFC4's two IFCTIME properties and a test file, not from a requirement a
  client wrote.
- The revision diff (pattern-lang.mjs) reads time ranges as intervals, not
  as this pattern's language.
