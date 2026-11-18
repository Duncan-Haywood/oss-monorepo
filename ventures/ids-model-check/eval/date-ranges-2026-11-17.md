# IDS editor: date and duration ranges, and where IfcTester parts (2026-11-17)

**Question.** IDS 1.0's DataTypes table gives IFCDATE an `xs:date` base,
IFCDATETIME `xs:dateTime`, IFCTIME `xs:time` and IFCDURATION `xs:duration`, and
allows `minInclusive` / `maxInclusive` / `minExclusive` / `maxExclusive` on all
four. The editor offered a **between** row only on numbers, so "a warranty that
starts on or after 2024-01-01" could not be written, and an opened file with a
date range was held as read-only XML. Can a row write one, and do this checker
and IfcOpenShell's IfcTester agree on it?

**What landed:**

- `editor.mjs`: `temporalType(dataType)` names the XSD form of IFCDATE,
  IFCDATETIME, IFCTIME and IFCDURATION. A property or attribute of one of those
  types keeps the text modes (exactly, one of, pattern) and gains **between**,
  written on that base (`<xs:restriction base="xs:date"><xs:minInclusive
  value="2024-01-01"/>`). `appMatchCount` orders date bounds as dates, so a
  condition's count of model matches agrees with the checker. An opened range
  on the matching base opens as a row; one on `xs:string` is still kept as
  written.
- `datePattern(min, max, minEx, maxEx)`: the XSD pattern matching exactly the
  ISO dates a date range asks for (with or without a time zone). Fixed-width
  dates order as strings, so the pattern is the lexical range between the
  bounds built digit by digit; exclusive bounds move a day inward.
- `editor.html`: range rows on dates show ISO placeholders (2024-01-01,
  P1Y), flag a bound in the wrong form (no value can match it), note how
  durations in years and months are ordered, and warn about IfcTester (below)
  with a **Write as a pattern** button on date rows.
- Presence-only standard properties with no dataType (`<property>` with no
  `dataType` and no value, as Rotterdam's permit checks and bim2sim write
  them) now open as rows that keep no dataType, instead of being held as
  written (`editableRow`; the template's dataType would narrow what they ask).
- A contradiction in the property note: with a model open, a standard
  property the model carries in the template's type said "The model has it on
  61 of 61. None of the model's 61 IFCDOOR object(s) has it yet." (since
  #16740). The second sentence now shows only when the model lacks it.
- Range rows on numbers with an exclusive bound say that IDS ranges take no
  rounding tolerance (`ImplementersDocumentation/tolerance.md`): "less than
  2100" is compared exactly, unlike "exactly 2100".

## Measured: IfcTester and this checker on date ranges

`node eval/date-ranges.mjs OUT.ids OUT.ifc` writes, through the editor, 16
ranges and 10 date patterns on a model of 61 doors (the sample house's door
plus 60 with Pset_Warranty start and end dates spread over 2022 to 2027);
`python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc` with ifcopenshell
0.9.0.post1 and ifctester 0.9.0 from PyPI. Full output:
`eval/date-ranges-ifctester.txt`.

| Requirement | Specs | Same verdict and failing doors |
| --- | ---: | ---: |
| date ranges (`xs:date` bounds) | 10 | 0 of 10 |
| duration ranges (`xs:duration` bounds) | 6 | 3 of 6 (the three that fail every door anyway) |
| the same 10 date ranges as `datePattern` patterns | 10 | **10 of 10** |

IfcTester fails all 61 doors on every range: its `Restriction.__eq__`
(`ifctester/facet.py`, 0.9.0) compares bounds with `float(other) <
float(value)`, and `float("2024-01-01")` raises, which it reads as a failure.
This checker fails 30, 35, 59, 28, 50, 51, 35, 40, 42 and 56 doors on the ten
date ranges, and its pattern versions fail the same doors, in both checkers.

So a date range is valid IDS and this checker reads it as the standard says,
but a recipient who checks with IfcTester (Bonsai/BlenderBIM, many CI
pipelines) sees every object fail. The editor says so on the row, and for
dates offers the pattern both read the same way. Durations have no such
rewrite (P1Y and P365D are the same length to some readers and not to
others), so the row suggests exact values instead.

**The pattern itself**, checked in `editor.test.mjs`: on 157 ranges (7 named,
150 seeded random, inclusive and exclusive bounds, open ends) every day from
1985 to 2045 in steps of 3 days matches the pattern exactly when it is in the
range, with and without a `+01:00` zone; a 3,000-range fuzz over 1995-2035
during development found 0 mismatches. Patterns audit clean on an IFCDATE
property. They are long (93 characters for one calendar year, 261 for an
open-ended "on or after") but readable digit by digit:
`2026-(0(1-(0[1-9]|[1-9]\d)|[2-9]-\d\d)|1([0-1]-\d\d|2-([0-2]\d|3[0-1])))(Z|[+\-]\d{2}:\d{2})?`
is 2026-01-01 to 2026-12-31. The pattern checks the shape, not that a day
exists: 2026-02-31 would match, and no model holds it.

## Measured: opened files

`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh && node eval/editor-open.mjs`:

| Corpus | Facets editable before | After | Files with every facet editable | Write back asking the same |
| --- | ---: | ---: | ---: | --- |
| 64 public IDS files | 1,714 of 2,012 (85.2%) | **1,738 (86.4%)** | 14 to **17** | 507 of 507 specifications |
| 12 IDS-Audit-tool valid files | 202 of 808 (25.0%) | **214 (26.5%)** | 3 | 288 of 288 |
| 187 buildingSMART pass cases | 319 of 374 | 319 | 132 | 187 of 187 |

The 24 new rows in the public files are presence-only standard properties
with no dataType (Pset_WallCommon, Pset_WindowCommon, Pset_PlateCommon and
others in 9 files). The 12 in the IDS-Audit-tool files are date, date-time,
time and duration ranges on standard properties. Their attribute date ranges
(SubmittedOn, IncorporationDate) stay kept: those specifications' class is a
pattern the page has no control for. No public file has a date range on a
standard property; the one public date range (a `minInclusive` 2012-12-01 in
a rulebook-generated file) sits on a Pset_BuildingCommon facet whose property name is a restriction, not one name, which the page has no control for.

## Not done

- `xs:date` enumerations on IFCDATE (the IDS-Audit-tool writes 4): a one-of
  row writes `xs:string`, so these stay kept. Writing the DataTypes base for
  one-of rows would change every file the editor has written.
- **Use the model's range** for dates: the model's dates are listed but not
  offered as a range.
- dateTime patterns (fractional seconds make them variable-width).
- Reporting the IfcTester float cast upstream (IfcOpenShell is LGPL; an issue
  is the owner's call, as it posts under the portfolio's name).
