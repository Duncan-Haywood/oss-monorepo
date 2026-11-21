# dateTime ranges as patterns (2026-11-21)

**Question.** IfcTester 0.9.0 casts IDS range bounds to float, so it fails
every object on an `xs:dateTime` range (measured again below: 31 of 31 beams
fail all 10 ranges). The editor's **Write as a pattern** fixed this for
`xs:date` ranges on 2026-11-20 (eval/date-pattern-exact-2026-11-20.md) but
offered nothing for date-times, because a dateTime is variable width
(fractional seconds) and its time zone shifts the instant by minutes, not by
whole days. Can one XSD pattern pass exactly the date-time strings this
checker passes on the range?

## What this checker's range does (ids.mjs, temporal.mjs)

Measured in Node 22 (V8), which the checker uses via `Date.parse`:

- no zone is UTC; `Z`, `+00:00` and `-00:00` are the same instant;
- milliseconds are kept and further digits dropped (`12:00:00.9999` is
  `.999`); `12:00:00.` is not a value;
- `24:00:00` (with `.0`, `.000`, ... only) is the next midnight;
  `24:00:01`, `23:59:60`, `23:60:00` are not values;
- an offset is `+hh:mm` with hh up to 23 and mm up to 59 (`+24:00`,
  `+10:60` are not values);
- the day must exist (2025-02-29 fails), and value and bound must both be
  dateTimes (a plain date fails a dateTime range).

## What changed

`temporal.mjs` gains `dateTimeRangePattern(r)`, `editor.mjs` gains
`dateTimePattern(min, max, minEx, maxEx)`, and the editor shows **Write as a
pattern** on dateTime ranges (`editor.html`). The pattern is built from the
range's instant interval [A, B] in milliseconds:

- local days that every offset up to +-23:59 leaves wholly inside the range
  are written once with `dayPattern` (2026-11-20) and any time and any zone;
- the days near each bound are written per offset: whole, or a time range
  to the millisecond (hours 00-23, minutes and seconds 00-59, then a
  fraction whose first three digits fall in range, written for 1, 2 and 3+
  digits; `24:00:00(\.0+)?` where the next midnight is in range);
- near a bound only the 44 UTC offsets time zones used from 2000 to 2026
  are written (every IANA zone in ICU sampled weekly 2000-2026, 43 offsets,
  plus -12:00 for Etc/GMT+12). Writing all 2,879 possible offsets would cost
  one alternative each per bound; an offset no zone uses (`+10:17`)
  therefore passes only more than a day inside the range. That is the one
  place the pattern asks more than the range.

## Measured

```
node eval/datetime-pattern.mjs OUT.ids OUT.ifc         # eval/datetime-pattern.txt
python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc   # eval/datetime-pattern-ifctester.txt (ifcopenshell 0.9.0.post1, ifctester 0.9.0)
node eval/datetime-pattern-page.mjs                    # eval/datetime-pattern-page.txt (Chromium)
node --test datetime-pattern.test.mjs
```

31 beams, each with one `Pset_PrecastConcreteElementFabrication.ActualErectionDate`
(IFCDATETIME) chosen on the edges above, against 10 dateTime ranges and the
pattern the editor writes for each:

| check | result |
|---|---|
| beam verdicts unlike the range, zones in use | 0 of 290 |
| beam verdicts unlike the range, `+10:17` | 3 of 20 (the pattern refuses, the range passes; all near a bound) |
| IfcTester 0.9.0 on the range | fails 31 of 31 beams on all 10 ranges |
| IfcTester 0.9.0 on the pattern vs this checker | same failing beams, 10 of 10 specs |
| pattern length | 2,938 to 16,294 characters |

Unit test (`datetime-pattern.test.mjs`): 24 ranges (10 written, 14 random
1950-2050, one-sided and exclusive bounds, bounds with zones and fractions,
0000 and 9999 ends), each compared with the range through this checker's own
XSD regex reader on every zone in use plus no zone, `Z` and `-00:00`, at 49
offsets from each bound (0, 1 ms ... 3 days), each written five ways
(fractions of 1, 2, 3 and 4 digits, none, 24:00:00): over 100,000 strings,
0 differences; five offsets no zone uses never pass what the range refuses;
14 malformed strings refused alike. Breaking the fraction rule (dropping the
`[0-9]*` after three digits) fails the test.

Page (Chromium, 390 px): an opened IDS with a dateTime range on a beam shows
the IfcTester warning and the button; the downloaded file has a 9,320
character pattern and no range, and passes a beam inside and fails one a
millisecond late, as the range does. No horizontal scroll, no page errors.

## Not done

- The pattern is large (up to 16 kB) because each offset near a bound has
  its own time range. Both checkers read it in under a second here; a
  person reading the file sees a long pattern. A shorter form exists only by
  giving up exactness (whole minutes, or UTC-only values).
- Time ranges (`xs:time`) and durations still have no pattern; a duration
  range orders months as 30.44 days, which no pattern can follow.
- The revision diff (pattern-lang.mjs) still reads dateTime ranges as
  intervals, not as this pattern's language, because of the `+10:17` gap.
