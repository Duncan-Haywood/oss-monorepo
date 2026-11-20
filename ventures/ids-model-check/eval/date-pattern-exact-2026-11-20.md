# "Write as a pattern" made exact (2026-11-20)

**Question.** IfcTester 0.9.0 fails every object on an IDS date range (it
casts the bounds to float; eval/date-ranges-2026-11-17.md), so the editor
offers **Write as a pattern**, which rewrites a date range as an XSD pattern
both checkers read the same way. That pattern was a *shape*: `\d` digits, any
day number up to 31, any time zone. So it did not ask what the range asked:

- `2024-02-30`, `2023-02-29`, `2024-04-31` matched it. The range refuses
  them: no such day (eval/date-range-revisions-2026-11-20.md).
- `\d` in XSD is any Unicode decimal digit, so `٢٠٢٤-05-01` (Arabic-Indic
  digits) matched `>= 2024-01-01`. The range refuses it.
- The zone was ignored. Under the range, `2024-05-01+01:00` starts at
  23:00 UTC on 30 April, so it fails `>= 2024-05-01`; the pattern passed it.
  `+24:00` and `+10:60` are not zones; the pattern took them.
- XML whitespace around the value: the range drops it, a pattern does not.

Did "Write as a pattern" change which objects pass? It should not.

## What changed

`temporal.mjs` gains `dayPattern(lo, hi)`: one XSD pattern, ASCII digits
only, matching exactly the ISO days from lo to hi that exist. Month lengths
are written per month, and 29 February only on leap years (proleptic
Gregorian over 0000-9999: years by century, decade and digit, so an open
bound such as "from 2024" stays about 1.2 kB, not a list of every year).
`dateRangePattern(r)` builds, for each zone sign, the day span the
checker's instant test allows (the table in
eval/date-range-revisions-2026-11-20.md), with the zone forms Date.parse
accepts and XML whitespace on both ends. The editor's `datePattern` now
returns that, and `pattern-lang.mjs`'s `dateRangePatterns` (the revision
diff's reading of a date range) uses the same single pattern instead of two
intersected ones, so the diff and the editor cannot drift apart.

## Measured

```
node eval/date-pattern-exact.mjs OUT.ids OUT.ifc
python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc   # ifcopenshell 0.9.0.post1, ifctester 0.9.0
```

31 doors, each with one `Pset_Warranty.WarrantyStartDate` chosen to sit on
the differences above (plus the sample house's door with none), checked
against 10 date ranges, the old pattern and the new one. Full output:
`eval/date-pattern-exact.txt`.

| check | old pattern | new pattern |
|---|---|---|
| door verdicts unlike the range, this checker | 50 of 310 | 0 of 310 |
| same failing doors as IfcTester 0.9.0 | 10 of 10 specs | 10 of 10 specs |
| range itself, IfcTester vs this checker | 1 of 10 the same (IfcTester fails every door; the one match is a range every door fails) | |

So the old pattern agreed with IfcTester but not with the requirement it
replaced; the new one agrees with both. Pattern length: 47 characters for a
single day to 1,404 for a one-sided open range.

Also rerun, unchanged:

- the 61-door eval/date-ranges.mjs set in IfcTester: 10 of 10 patterns the
  same failing doors (as on 2026-11-17, now with the exact patterns);
- eval/date-range-revisions.mjs on 473 public and test IDS files: 574 of 574
  strings agree with ids.mjs, 132 of 236 pairs graded, 94 of 94 examples
  right (same as with the two-pattern reading);
- unit tests: `editor.test.mjs` compares every pattern with `ids.mjs` on the
  range for over 50,000 day-and-zone strings over 69 ranges (1880-2060), and
  `date-range-lang.test.mjs` sweeps `dayPattern` over every month and day
  number 0-32 of about 40 years each for 86 spans across 0000-9999
  (over 200,000 strings), against the calendar.

## Not done

- dateTime ranges as patterns: fractional seconds make dateTimes
  variable-width; the editor still offers no pattern for them.
- Files the editor wrote before today keep the shape pattern. Opening one
  does not rewrite it; a later item could spot the old shape and offer the
  exact one.
