# "Write as a pattern" for date-and-time ranges (2026-11-21)

**Question.** IfcTester 0.9.0 casts IDS range bounds to float, so it fails
every object on an `xs:dateTime` range, as it does on `xs:date` ranges
(eval/date-ranges-2026-11-17.md). For dates the editor offers **Write as a
pattern**, exact since 2026-11-20 (eval/date-pattern-exact-2026-11-20.md);
that write-up left date-and-time ranges open: fractional seconds make a
dateTime variable-width, and its zone moves the instant by up to 23:59.
Can one XSD pattern pass exactly what the checker passes on the range?

## What changed

- `temporal.mjs` `dateTimeRangePattern(r, { zones })`: one pattern, ASCII
  digits only, built field by field (day via `dayPattern`, so month lengths
  and leap years are in it; hour, minute, second; then the fraction, an
  arbitrary-length digit string compared as a decimal by `fracSet`).
  `24:00:00` (and `24:00:00.000`) is written as the next day's midnight,
  as XSD and `Date.parse` read it; years 0000-9999, the years the checker
  reads (`Date.parse` refuses five-digit and negative years). XML whitespace
  may surround the value.
- **Zones.** No zone, `Z`, `+00:00` and `-00:00` are placed exactly. A value
  in any other zone that lies more than a day (23:59) inside each bound
  passes whatever its zone. Within a day of a bound the instant depends on
  the zone minute by minute; because the zone is written *after* the time, a
  pattern exact for all 2,879 zones must carry the local minute to the zone,
  and runs to hundreds of kilobytes. So near a bound only the zones in
  `zones` are placed exactly (about 300 to 2,000 characters each; all 46
  whole-hour zones make 15 to 26 kB). The editor passes the zones the open
  model writes its dateTime values in (`editor.mjs zonesOf`), none without a
  model. Real exports write IFCDATETIME without a zone, so the usual pattern
  is the short one.
- **The checker, past the millisecond.** `Date.parse` keeps three fraction
  digits, so `2024-01-01T00:00:00.0004` keyed equal to `00:00:00` and failed
  `minExclusive="2024-01-01T00:00:00"`, which XSD's order passes. `ids.mjs`
  now compares with `temporalCompare` (whole milliseconds, then the
  remaining fraction digits as written); `24:00:00.5` stays refused.
- The editor offers the button on IFCDATETIME rows and says what the
  pattern covers.

## Measured

```
node --test datetime-range-pattern.test.mjs
node eval/datetime-pattern.mjs OUT.ids OUT.ifc
python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc   # ifcopenshell 0.9.0.post1, ifctester 0.9.0
```

**Unit sweep** (`datetime-range-pattern.test.mjs`): 23 ranges (11 written,
12 seeded at random; inclusive and exclusive, open on either side, bounds
with fractions to 7 digits, zoned bounds, `24:00:00`, year 0000 and 9999),
each against every string 0 ms, 1 ms, 1 s, 1 min, 1 h, 23:59, 24:00, 24:01
and 2 days either side of each bound, in 17 zones (none, Z, +/-00:00,
+01:00, -05:00, +05:30, -09:30, +05:45, +/-00:01, +/-23:59, +14:00, -12:00,
+00:37, -01:01), with 0, 3, 4, 7 and 10 fraction digits, the `24:00:00`
forms and a spread of values from 1890 to 2060, plus malformed strings
(`24:00:00.5`, `23:60:00`, `2024-02-30`, five-digit and negative years,
`+24:00`, `+10:60`, Arabic-Indic digits, a bare date). The pattern is read
with the XSD regex reader (`xsdregex.mjs`, elementpath's reading) and
compared with `ids.mjs` on the range itself. Over the sweep the only
differences are the documented gap: a value in an unlisted zone within a
day of a bound, which the range passes and the pattern does not. Never the
other way. With all whole-hour zones listed, 6 ranges, same result for them.

**Doors, this checker and IfcTester** (`eval/datetime-pattern.txt`,
`eval/datetime-pattern-ifctester.txt`): 40 doors, each with one
`ACME_Handover.InspectedAt` IFCDATETIME on those edges (plus the sample
house's door with none), 10 ranges, each as the range, the editor's pattern
with no model open, and the pattern with the model open (zones -05:00,
+01:00, +05:30, +09:30).

| check | pattern, no model | pattern, model open |
|---|---|---|
| door verdicts unlike the range, this checker | 30 of 400 | **0 of 400** |
| same failing doors as IfcTester 0.9.0 | 10 of 10 specs | 10 of 10 specs |
| pattern length | 118 to 2,229 characters | 476 to 4,065 |

The 30 are all zoned values within a day of a bound, for example
`2024-05-01T09:00:00+01:00` against `>= 2024-05-01T08:00:00` (the same
instant as the bound). IfcTester on the ranges themselves: 41 of 41 doors
fail on all 10, where this checker fails 12 to 40.

## Not done

- A pattern exact for every zone near a bound with no model open (size,
  above). A later item could offer it for the zones an author names.
- The revision diff (`pattern-lang.mjs`) still reads only date ranges as
  languages; a dateTime range would need the all-zones pattern to be exact.
- `xs:time` ranges as patterns (same machinery minus the day; times wrap
  at midnight under a zone, so the near-bound part differs).
