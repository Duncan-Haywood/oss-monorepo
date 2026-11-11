---
title: "One line that said \"Note:\" cut a customer's reply in half"
seo_title: "Reading mbox files: why a 'From' line plus 'Note:' split an email"
date: 2026-11-11
tags: [sales-agent, email, mbox, testing, mutation-testing, redteam]
description: "A red-team pass found that an unescaped 'From ...' paragraph followed by 'Note:' split a sales-agent reply and dropped half of it."
---

The [sales agent](../../ventures/sales-agent/) can read your exported mail (a
Gmail Takeout or Thunderbird `.mbox` file) in the browser and sort the replies
to your outreach. Nothing is uploaded. Today a red-team run aimed at the
file reader, `mailfile.mjs`, which changed earlier in the day.

## The bug

An mbox file is many messages glued together. Each starts with a line
beginning `From ` (no colon) after a blank line. Some exporters do not escape
a body line that happens to start with `From `, so a reader has to guess
whether `From our side the only open point is timing.` is a new message or a
sentence.

The reader's guess was: it is a new message if the next line looks like a
header. "Looks like a header" meant any word, a colon and a space. So this
reply:

```
Happy to go ahead.

From our side the only open point is timing.
Note: we need it live before March.

Dana
```

came out as two messages. The first ended at "Happy to go ahead." The second
started at "Note: ..." and, having no reply headers, was counted as "not a
reply" and dropped. The line that mattered most, the deadline, never reached
the inbox triage.

The fix: a candidate line starts a message only if the next line is a header an
exporter actually writes first (`X-GM-THRID`, `X-Mozilla-Status`,
`Return-Path`, `Received`, `From:` and a few more), or if the line reads as a
real dated envelope and a header or blank line follows. We re-ran the reader
on the eleven public mbox files it was checked against this morning (four real
Takeout and Thunderbird exports, seven fixtures): every count is identical,
11 of 11 files split right, none with an empty message.

## What the tests missed

Before hunting, the run seeded eight small faults into the same file (a `0`
turned into `1`, a `+` into a `-`) and ran its test suite each time. The tests
caught one. The seven that got through included a size cap off by four bytes
a line, a trailing carriage return eating the last letter of a message, the
"most frequent sender" hint losing its count (so the page's "is this you?"
nudge never showed), and the summary line claiming messages were "cut at
200000000 KB". Each now has a test, and a rerun of all seven confirms the
tests fail with the fault in place. The same run also fixed "1 duplicates"
and "1 not replies" in that summary.

A second campaign on a `platform/` lint (`check_blank_targets.py`) caught 7
of 8; the survivor only changed `--help` text.

The numbers live in the run record,
`prompts/runs/2026-11-11-session_01EhTJVPE3zhV5yBSb4zi5Xn.json`.
