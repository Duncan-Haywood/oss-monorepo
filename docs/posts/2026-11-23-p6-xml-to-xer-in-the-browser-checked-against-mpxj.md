---
title: "P6 XML to XER in the browser: 21,441 of 21,441 activities schedule the same"
seo_title: "Convert P6 XML to XER free in the browser, checked on 6 files"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, pmxml]
description: "XER Schedule Check now reads P6 XML from P6 EPPM and Primavera Cloud and writes it back as an XER. How it was checked, and what the test caught."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) has read Primavera P6
`.xer` files and Microsoft Project XML since it started. It did not read the
other file P6 writes: **P6 XML**, the format whose root element is
`<APIBusinessObjects>`. That is what P6 EPPM (the web version) and Oracle
Primavera Cloud export, and P6 Professional writes it from File, Export,
Primavera PM (XML). So an owner's rep whose contractor runs P6 EPPM could get
a file the tool turned away, and plenty of review tools and specifications
still ask for an XER.

Now any box on the page that takes an XER takes a P6 XML file too, and a new
button writes it back as an XER (`node cli.mjs schedule.xml --to-xer out.xer`
from the command line). The reader turns P6's API objects (Activity,
Relationship, WBS, Calendar, ScheduleOptions, ResourceAssignment, activity
codes, user-defined fields, notes) into the same tables an XER holds, so the
DCMA and GAO checks, the Gantt chart, the update comparison, risk, levelling
and the time impact analysis run on it with no other change.

## How do you test a converter with no answer key?

No public schedule exists as both an XER and a P6 XML of the same project; we
looked. So the six public P6 schedules this tool is always tested on were
written as P6 XML by [MPXJ](https://github.com/joniles/mpxj), the open-source
library most schedule converters are built on. Then:

| Check | Result |
|---|---|
| Activities, calendars (work week and holidays), WBS paths the same as the XER | 21,758 of 21,758 each |
| Relationships found with the same type and lag | 56,666 of 56,666 |
| Recomputed early and late dates and total float equal to the XER's | 21,441 of 21,441 |
| XML written back as XER, scheduled again | 21,441 of 21,441 |
| MPXJ reading our XERs vs the originals (names, dates, durations, progress, constraints, calendars, logic) | 239,338 of 239,338 fields |

One file P6 itself wrote as XML, with 33 activities and 24 resource
assignments, gives the dates P6 stored on 32 of its 32 open activities.

## What the test found

The MPXJ comparison caught one real fault on its first run: P6 XML writes an
activity code's colour as `#0000FF`, an XER as `0000FF`, and MPXJ refused the
converted file over the `#`. Fixed, then 239,338 of 239,338.

It also caught two faults in the test's own generator, which is why it is
worth checking a tool against more than one reader. One public file keeps its
calendar as P6 Web writes it, a quoted value spread over several lines; MPXJ
does not read that and silently wrote a default 08:00 to 16:00 week into the
XML, which made 424 of that file's 425 activities disagree. The other: MPXJ
writes an XER's project node as an extra top-level WBS element. Both were
traced to MPXJ's own reading of the XER and worked around in the test, not in
the reader.

## What it does not do yet

P6 XML leaves out total float, so the one check that compares P6's stored
float with the logic has nothing to compare on these files, and says so.
Baseline projects inside an XML file are named and not converted. And the
converted XER has been read by this tool and by MPXJ, not yet imported into
P6 itself. The full write-up, with the per-file table, is
`ventures/xer-schedule-check/eval/pmxml-2026-11-23.md`; the how-to is the
[P6 XML to XER guide](https://marisstella.app/xer-schedule-check/how-to-convert-p6-xml-to-xer.html).

*Screening tool, not scheduling, contractual or legal advice. Not affiliated
with Oracle or Primavera.*
