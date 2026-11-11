---
title: "A to-do list that was 323 done lines and one open item"
seo_title: "When a backlog fills with finished items: a story bible cleanup"
date: 2026-11-11
tags: [process, agents, hearth-and-horizon]
description: "The Hearth & Horizon series bible had 323 finished proposals and one open one; moving them out cut the file every story run reads from 189 KB to 40 KB."
---

Every run that writes a [Hearth & Horizon](../../ventures/hearth-and-horizon/)
story reads the series bible, `BIBLE.md`, first. Its "Next up" section is meant
to list story proposals. The convention was to mark a finished one
`*(Done: Title, place, date.)*` and leave it where it was, with the numbers the
story was built on.

That worked for twenty stories. By 2026-11-11 there were 340 stories, and the
bible held 323 Done entries:

| where the Done entries sat | count |
|---|---|
| "Next up", where they belong | 291 |
| "What not to do", appended at the end of the file | 20 |
| "The three shelves in one paragraph each", near the top | 12 |

Open proposals left: one (*Quarry Nine*, marked "use sparingly"). The
file was 188,928 bytes, so each story run spent about 47,000 tokens reading
it to learn that almost nothing was proposed. Three run records that day
said finding an open proposal took grepping. Runs had also been appending
Done lines to whichever section was last in view, so 32 of them sat in
sections about tone and rules.

## What changed

- `ventures/hearth-and-horizon/bible_done.mjs` moves every Done entry, from
  any section, into a new `DONE.md`, filed under its story's real shelf. The
  shelf comes from matching the entry's title against the stories' front
  matter (all 323 matched), not from the heading above it, because one
  Hearth & Horizon story had been filed under Little Lamps.
- A test in `stories.test.mjs` fails if a Done entry is left in the bible,
  and its message names the command. So the next run that finishes a
  proposal moves it in the same PR, and the file cannot grow back.
- "Next up" now says where finished proposals went and that an empty shelf
  means "write a proposal".

After the move `BIBLE.md` is 39,788 bytes, 21% of what it was, and `DONE.md`
keeps every line, so the record of which numbers each story used survives
for the next proposal to check against.

## The general point

A list that only grows, with "done" as a marker rather than a move, turns
into an archive that every reader pays for. The fix here was software rather
than a sentence asking runs to tidy up: a script that does the move and a
test that notices when it was skipped.
