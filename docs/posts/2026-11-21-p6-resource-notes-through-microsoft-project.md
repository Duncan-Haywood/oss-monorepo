---
title: "Resource notes between Primavera P6 and Microsoft Project, and the 469 resources with nothing in them"
seo_title: "Carry P6 resource notes to Microsoft Project and back, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "XER Schedule Check now carries resource notes between P6 XER and Project XML both ways; 241 of 241 planted notes return, and MPXJ reads Project's 17 the same."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) converts a Primavera
P6 `.xer` export to Microsoft Project XML, and a Project file back to an XER,
in the browser. Until today both directions dropped one thing without saying
so: the free-text note on each resource. In P6 that is the box on the
resource's Notes tab, where planners keep the union rate clause, the hire
depot or the foreman's number. In Project it is the Notes field on the
resource sheet.

Now the note goes across both ways. From P6, the rich text P6's editor
writes (P6 desktop's DHTML with its odd 0x7F line breaks, or P6 Web's
HTML) is read as plain text, with paragraphs, line breaks and list items
kept on their own lines. From Project, the note is written back the way P6
Web writes rich text, one paragraph per line. A Project *cost* resource has
nowhere to put it, because cost resources become P6 expenses and expenses
have no notes, so the converter now says "1 cost resource note not carried"
instead of losing it quietly.

## How it was checked

The obvious test was the public P6 files we already use: six exports from
P6 5.0 to 24.12, whose projects write 469 resources. **None of them has a
resource note with any text in it.** Three have a note field that is not
empty, but each holds only the shell P6's editor leaves behind: an empty
`<HTML><BODY></BODY></HTML>`, or a full DHTML header with no body. The check
now confirms those shells write no note in Project, which is the right
reading, but it cannot test real text.

So the P6 side rests on planted notes: 241 notes placed on the resources of
five of those files, made by the same seeded generator as the notebook
check (desktop DHTML, Web HTML and plain text, with lists, line breaks,
entities, tabs, quotes and accented letters). The generator also writes the
text a reader should see, so the reader is checked as well as the round
trip.

| Check | Result |
|---|---|
| Planted notes in the Project XML, read as meant | 241 of 241 |
| ... back in the XER on the same resource ID | 241 of 241 |
| Project resource notes (MPXJ's test files, Project 2002 to 2019) in the XER | 17 of 17 |
| P6 import problems in the XERs written | 0 |

[MPXJ](https://github.com/joniles/mpxj), an independent open-source reader
of both formats, read Project's 17 notes the same from the source XML and
from our XER, word for word and line for line. On the planted set it agreed
on the words for 197 of 199 uniquely named resources. The two others are
notes that start with a quote mark, where MPXJ misreads the *original* file:
it takes the doubled quote at the start of the value as the start of a
quoted field. The notebook check found the same thing.

## What is still open

Of Project's 17 notes, 11 belong to resources that no task uses. They reach
the XER, but on the way back to Project they do not appear, because the
converter writes only the resources the project's activities use. A P6
resource dictionary is often shared by many projects, so that rule keeps
the Project file small, but it means a resource list made in Project and
sent through P6 comes back shorter. An option to keep the whole list is
next on the venture's list. Neither direction has been opened in a licensed
P6 or Project; the full write-up is in
[`eval/resource-notes-2026-11-21.md`](../../ventures/xer-schedule-check/eval/resource-notes-2026-11-21.md).

If you have a P6 export with resource notes that hold text, it is the one
file this check is missing.
