---
title: "P6 notebooks in Microsoft Project: carrying activity notes across an XER conversion and back"
seo_title: "P6 notebook notes to Microsoft Project and back"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "XER Schedule Check now carries P6 notebook entries into Project task notes under their topics and back: 88 of 88 real and 2,006 of 2,006 planted entries."
---

Schedulers put the reasons behind dates in Primavera P6's activity notebook:
"Submitted as clause 14", "Rain 12-14 March", "client to confirm finishes".
When the schedule goes to someone who works in Microsoft Project, those notes
should go with it. Until this morning, [XER Schedule Check](../../ventures/xer-schedule-check/)
dropped them. It counted them ("not carried: 87 notebook entries") in both
directions, P6 to Project and Project to P6.

## Two different shapes

P6 keeps one entry per **notebook topic**. Topics are a list the database
defines (Description, Delays, Anticipated Problems...), and an activity can
have an entry under several. Each entry is HTML from P6's editor. P6 desktop
writes a full `<HTML><HEAD>...` document with each line break stored in the
XER as two 0x7F bytes. P6 Web writes `<HTML><BODY><P>...</P></BODY></HTML>`.
Some files hold plain text.

Microsoft Project has one plain-text **Notes** field per task.

So the converter now writes a task's notebook into its notes, topic by topic
in P6's topic order, each under its topic's name in brackets:

```
[Description]
Pour after the cube results.

[Delays]
Rain 12-14 March.
```

WBS notebooks go on the summary tasks, and the project node's on the project
summary task. Going the other way, a note in that form becomes one notebook
entry per topic. Any other note, the kind a Project planner types, becomes one
entry under a topic called "Notes". A schedule can go P6 to Project to P6 and
keep its notebook.

Two details needed care. A line inside a note that looks like a heading
(`[see RFI 12]` after a blank line) is written indented one space, so it
stays in its entry. The topic order is rebuilt from the order in every note,
because P6 lists topics by a sequence number that Project has nowhere to keep.

## How we checked it

The six public P6 files we test against hold 88 real notebook entries. Most
are one-word tags on a 2013 expressway schedule; there is also a DHTML clause
reference and one P6 Web note. All 88 appear in the Project XML under their
topic. All 88 come back to the XER on the same activity, under the same topic,
with the same text.

Eighty-eight short entries is not much, so we planted 2,006 more across the
six files. They come in desktop, Web and plain-text form, with lists, line
breaks, entities, quotes, accents and lines that look like headings. The
generator also wrote the text a person should see. All 2,006 read as meant
and came back unchanged. 700 of 700 activities with several topics kept their
order, and P6's import rules found nothing to refuse.

We also checked against MPXJ, the open-source library most schedule
converters use. It read the same words from the original XER and from ours on
1,702 of 1,713 entries. The other 11 are a project-level entry MPXJ shows on
no task in either file, and 9 planted plain-text entries that start with a
quote mark, which MPXJ misreads in the original.

## A bug found on the way

To compare with MPXJ we had to save the XER files. MPXJ read "façade" in our
Project-to-P6 output as "faÃ§ade". The converter saved UTF-8, while P6 writes
an XER in the Windows code page and readers such as MPXJ expect one. That hit
every accented task name, not only notes. The file is now saved in
Windows-1252. When a character does not fit (a Cyrillic name, say), it stays
UTF-8 and the tool says so.

## What it does not do

The text goes across, not the formatting: bold, colour and tables are lost,
because Project's XML notes are plain text. We have neither a P6 nor a
Project seat, so the files have not been opened in either program. The
checks use two independent readers (this tool's own and MPXJ) and the field
lists of real P6 exports. Details and every number:
[`eval/notebooks-2026-11-21.md`](../../ventures/xer-schedule-check/eval/notebooks-2026-11-21.md).

The converter runs in the browser tab; the file is not uploaded. It is not
professional advice. Have a scheduler check anything you submit.
