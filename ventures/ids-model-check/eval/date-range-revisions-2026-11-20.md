# Date ranges in the revision diff, and days that do not exist (2026-11-20)

**Question.** The revision diff (`revision.mjs`, eval/revision-diff-2026-11-20.md)
graded a pattern edit exactly (eval/pattern-inclusion-2026-11-20.md) but any
edit touching a date, time or duration range as "different": `>= 2024-01-01`
to `>= 2024-06-01` was "different", not "asks more". Can those ranges be
compared exactly, as the checker reads them, including against patterns?

## What the checker passes on a date range

`ids.mjs` passes a string on a range with date bounds when the string, less
whitespace around it, is an ISO date (`YYYY-MM-DD`, optional `Z` or `±hh:mm`)
and its instant (midnight in its own zone, no zone read as UTC; `temporal.mjs`)
is within the bounds. Two things came out of reading that exactly:

- **Days that do not exist passed.** `Date.parse` rolls `2024-04-31` into
  1 May and `2023-02-29` into 1 March, so `2024-04-31` passed
  `minInclusive="2024-05-01"`. XSD's lexical space for `xs:date` has no such
  day. `temporalKey` now returns NaN for a day the month lacks (leap years
  per the proleptic Gregorian calendar), so it passes no range.
- **Trimming.** `String.prototype.trim` dropped a no-break space and other
  Unicode spaces around a value. XSD's `whiteSpace="collapse"` drops only
  space, tab, CR and LF; the checker now does the same.

buildingSMART's 334 test pairs still score 334 of 334 (`node
eval/run-testcases.mjs`, suite commit 870f9c4); the venture's 391 tests pass.

## Date ranges as languages

Days are whole and a zone offset is under a day (Date.parse refuses hours
over 23 and minutes over 59), so for plain-date bounds the instant test
becomes a test on the written day by the zone's sign:

| bound | no zone, Z, ±00:00 | east (+hh:mm) | west (-hh:mm) |
|---|---|---|---|
| minInclusive L | day >= L | day >= L+1 | day >= L |
| minExclusive L | day >= L+1 | day >= L+1 | day >= L |
| maxInclusive H | day <= H | day <= H | day <= H-1 |
| maxExclusive H | day <= H-1 | day <= H | day <= H-1 |

Each column is a lexical range of fixed-width days (`lexRange`, moved from
the editor to `temporal.mjs`), with its zone forms, intersected with a
calendar pattern (month lengths, leap years) and XML whitespace on both
ends. `pattern-lang.mjs`'s `dateRangePatterns` writes these as XSD patterns
over ASCII digits (`[0-9]`, not `\d`, which in XSD is any Unicode digit), so
`restrictionLanguage` now covers date ranges, mixed with enumerations,
patterns and lengths, and `compareLanguages` grades them with the shortest
example both ways. Bounds with a zone, and dateTime, time and duration
bounds, are not plain days; `revision.mjs` compares those as intervals on
the checker's instants (ranges on two different forms share no value).

A consequence worth knowing: `<= 2024-02-29` and `< 2024-03-01` are not the
same requirement under the checker. `2024-02-29-00:01` is 00:01Z on the 29th,
past the first bound and under the second. The diff says "asks less" and
names that value.

## Measured

```
sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
node eval/date-range-revisions.mjs
```

473 IDS files (65 public, buildingSMART's IDS-Audit-tool test files and IDS
test cases) hold 31 distinct ranges with temporal bounds: 7 on plain dates,
9 dateTime, 11 duration, 4 time.

| check | result |
|---|---|
| plain-date languages vs `IdsValue.match`, strings near each bound (every zone sign, calendar edges, malformed forms) | 574 of 574 agree |
| same-form ordered pairs graded asks more / asks less (all "different" before) | 132 of 236 |
| the other 104 | different: they overlap only in part (a lower bound against an upper bound) |
| example values (passes one side, refused by the other) tested on `ids.mjs` | 94 of 94 right |
| plain-date ranges against the one date-like public pattern (`[0-9]{4}-...`, not a date form) | 14 of 14 different, correctly |
| time for all pairs | 2.8 s |

By form: dateTime 56 of 72 graded, duration 54 of 110, time 4 of 12, plain
date 18 of 42. The unit tests (`date-range-lang.test.mjs`) add 2,400 random
day/zone strings on 40 random ranges, and the diff cases above.

## Not done

- No public revision edits a date range yet, so the 69-revision tally in
  eval/revision-diff-2026-11-20.md is unchanged; the gain shows on a
  client's real stage-to-stage pair.
- dateTime ranges against patterns (fractional seconds make dateTimes
  variable-width; still "different").
- The editor's "Write as a pattern" (`datePattern`) still writes `\d` and
  does not check a day exists; the language here is exact, the editor's
  pattern is a shape. Tightening it would change files the editor has
  written.
