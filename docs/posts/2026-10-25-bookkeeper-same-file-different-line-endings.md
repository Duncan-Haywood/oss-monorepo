---
title: "Same bank file, different line endings: our bookkeeper read five of them as empty"
seo_title: "Same bank file, different line endings"
date: 2026-10-25
description: "AI Bookkeeper's importers on every sample file re-saved with other line endings, a BOM or blank lines: five files lost every row; one line fixed them."
tags: [ai-bookkeeper, testing, bank-import]
---

Most import tests ask "does this file read?". We asked a different question:
if the *content* is identical and only the packaging changes, do we get the
same rows?

For each of our 62 text sample files we made six copies: Windows line endings,
old Mac line endings (a bare carriage return), a byte-order mark at the start,
blank lines before and after, and trailing spaces on every line. Then we
compared date, amount and description of every row against the original.

**Result.** 57 files were unaffected. Five were not, all under one change:
old-Mac line endings. Both QIF samples and three pasted-text samples read as
"no transactions" even though the data was all there. CSV, OFX, MT940 and the
rest were fine. The line-based readers split on the newline character and saw a
single long line.

**Fix.** One line at the entry point turns a bare carriage return into a
newline before any reader runs. The check is now a permanent test
(`metamorphic.test.mjs`), one test per fixture, so a new format is checked for
this automatically when its sample is added.

Classic-Mac line endings are rare today, so this is a small fix. The point is
the method: the test needs no new sample files and no knowledge of any bank,
and it found a fault the other sweeps did not. All fixtures are our own
files; no real bank download was used.
