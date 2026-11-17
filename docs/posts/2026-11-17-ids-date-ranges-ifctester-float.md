---
title: "A date range in an IDS file is valid, and IfcTester fails every object on it"
seo_title: "IDS date ranges: why IfcTester fails every object"
date: 2026-11-17
tags: [bim, ifc, ids, ifctester, regex]
description: "IDS 1.0 allows xs:date ranges. IfcTester 0.9.0 casts bounds to float and fails every object. An XSD pattern of the same dates reads the same in both."
---

[IDS Model Check](https://marisstella.app/ids-model-check/)'s
[IDS editor](https://marisstella.app/ids-model-check/editor.html) lets you
write a buildingSMART Information Delivery Specification by picking a class, a
property set and a property. Until today a **between** row was offered only on
numbers. Requirements like "the warranty starts on or after 1 January 2024"
or "the work day is at most PT8H" could not be written.

IDS 1.0 allows them. Its DataTypes table gives `IFCDATE` the base `xs:date`,
`IFCDATETIME` `xs:dateTime`, `IFCTIME` `xs:time` and `IFCDURATION`
`xs:duration`, and allows `minInclusive`, `maxInclusive`, `minExclusive` and
`maxExclusive` on all four. So the editor now writes them:

```xml
<property dataType="IFCDATE">
  <propertySet><simpleValue>Pset_Warranty</simpleValue></propertySet>
  <baseName><simpleValue>WarrantyStartDate</simpleValue></baseName>
  <value><xs:restriction base="xs:date"><xs:minInclusive value="2024-01-01"/></xs:restriction></value>
</property>
```

## Then we checked it against IfcTester

Each editor feature gets cross-checked against IfcOpenShell's IfcTester, the
checker behind Bonsai (BlenderBIM) and many CI pipelines. We built a test model
of 61 doors, each with a `Pset_Warranty` start and end date spread over 2022 to
2027, and wrote 16 ranges through the editor.

IfcTester 0.9.0 failed **all 61 doors on every range**. On "starts on or
after 2024-01-01" this checker fails 30 doors and IfcTester fails 61.

The reason is one line in `ifctester/facet.py`: a range bound is compared as
`float(other) < float(value)`. `float("2024-01-01")` raises a `ValueError`,
the restriction catches it, and the object fails. Durations go the same way.
The file is valid and the standard says what it means, but one widely used
reader can't evaluate it.

## A pattern both read the same way

A pattern is the workaround that works in both checkers. Dates in `YYYY-MM-DD`
form have a fixed width, so they sort as strings in date order. A date range is
therefore a range of strings, and a range of fixed-width digit strings can be
written as a regular expression one digit at a time. Take the lower bound's
digit and recurse, take any digit between the bounds and allow anything after
it, or take the upper bound's digit and recurse. For the calendar year 2026:

```
2026-(0(1-(0[1-9]|[1-9]\d)|[2-9]-\d\d)|1([0-1]-\d\d|2-([0-2]\d|3[0-1])))(Z|[+\-]\d{2}:\d{2})?
```

Exclusive bounds move one day inward. The optional suffix accepts a time zone.
The pattern checks the shape, not the calendar: it would accept 2026-02-31,
which no model holds.

The editor now warns on every date or duration range that IfcTester fails
every object on it. On date rows a **Write as a pattern** button turns the
range into this pattern. On the 61-door model the ten date ranges, written as
patterns, got the same verdict and the **same failing doors** in both checkers,
10 of 10. The unit test compares 157 ranges against every third day from
1985 to 2045, with and without a time zone, and finds no difference.
Durations have no such rewrite, because `P1Y` and `P365D` are not the same
length to every reader. There the row suggests listing exact values instead.

## Smaller things in the same change

- An opened IDS that asks only that a standard property be present, written
  with no `dataType` (Rotterdam's permit checks and bim2sim's window U-value
  check do this), now opens as an editable row instead of read-only XML. Over
  64 public IDS files, 86.4% of facets are now editable (was 85.2%), and 17
  files are fully editable (was 14). All 64 still write back asking the same
  thing.
- With a model open, a standard property the model already carried showed
  "The model has it on 61 of 61. None of the model's 61 IFCDOOR object(s) has
  it yet." The second sentence is gone when it isn't true.
- Exclusive numeric bounds now say that IDS ranges take no rounding tolerance:
  "less than 2100" is compared exactly, unlike "exactly 2100".

The measurements and the scripts that reproduce them are in
[`eval/date-ranges-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/date-ranges-2026-11-17.md).
The checker and the editor run in your browser, and your files stay on your
machine. IDS Model Check is MIT licensed.
