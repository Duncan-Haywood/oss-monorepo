---
title: "Lists of dates in IDS: xs:date or xs:string, and why P24M is not P2Y"
seo_title: "IDS date enumerations: xs:date vs xs:string base"
date: 2026-11-17
tags: [bim, ifc, ids]
description: "The IDS editor now writes date and duration lists on xs:date and xs:duration. Both checkers compare the values as text either way, so list every form."
---

An IDS requirement like "the warranty starts on one of these dates" is an
XSD enumeration inside an `xs:restriction`. IDS 1.0's DataTypes table says
which `base` that restriction should have: `xs:date` for an IFCDATE property,
`xs:dateTime` for IFCDATETIME, `xs:time` for IFCTIME and `xs:duration` for
IFCDURATION. The [IDS editor](https://marisstella.app/ids-model-check/editor.html)
already wrote date and duration *ranges* that way, but its "one of" lists
still went out on `xs:string`. It also couldn't edit lists that other tools had
already written on `xs:date`, so buildingSMART's own IDS-Audit-tool test files
opened with those facets as read-only XML.

As of today, a "one of" row on a date, date-time, time or duration writes the
DataTypes base. Files the editor wrote before today keep `xs:string` when you
reopen them, so they are written back byte for byte. If you want to move one
of those rows to the new base, the row has a **Write on xs:date** button.

## Does the base change any verdicts?

No, and that matters more than the base itself. IfcOpenShell's IfcTester
(0.9.0) compares an enumeration value with the model value's own type and
never reads the base, so for a date it compares strings. This checker also
compares the text. We wrote eight lists on a test model of 61 doors, each one
on both bases. The two bases gave the same failing doors every time, and
IfcTester agreed with this checker on all 16.

Two of those eight show the catch. A list holding `P24M` does not match a door
whose warranty period is `P2Y`. A list holding `2024-05-01Z` and
`2024-05-01+00:00` does not match a door dated `2024-05-01`. In XSD's value
space, P24M and P2Y are the same duration, and the two zoned dates are the
same day as each other. Neither checker reads them that way. A list has to
name each form the model actually writes, and the row now tells you so. If
you want "two years or more", use a range, which this checker compares by
value. (IfcTester 0.9.0 still fails every object on a date range, as we found
earlier; for dates, the editor's **Write as a pattern** gets around that.)

## Opened files

Of the 29 date and duration lists in the IDS-Audit-tool's valid test files, 13
now open as editable rows. That raises the editable share of those files from
26.5% to 28.1%, and all 12 files still write back asking the same. The other
16 lists sit in specifications that select by an attribute with no class, a
shape the editor can't edit yet. None of the 64 public IDS files we track
lists dates.

Measurements, scripts and the IfcTester output:
[`eval/date-oneof-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/date-oneof-2026-11-17.md).
