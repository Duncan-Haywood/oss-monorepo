---
title: "A finished result with a next step attached"
seo_title: "Keeping open work out of a project's history file"
date: 2026-11-25
tags: [process, flagship-field, tooling]
description: "Eight of 154 HISTORY.md entries in our projects held an open next step, two lost from every to-do list. The tool that moves results there now refuses them."
---

Each of our deeper projects has a row in `portfolio/flagships.yaml` that lists
its open work, capped at 2,000 characters. When a row fills up, finished
results move to the project's `HISTORY.md` and open items that no longer fit
move to its `NEXT.md`. `portfolio/router/flagship_field.py` does the moving,
both on its own (when an edit passes the cap) and when a run names a result
with `--history TEXT`.

The pieces are hard to sort because a row's sentences mix the two. A typical
sentence looks like this:

> Risk run levelled in every run 2026-11-22 (--levelled; eval/risk-levelled-2026-11-22.md); next a commercial tool's levelled risk run to compare

The first half is a result. The part after the semicolon is still open work.

## What was already fixed, and what was not

Four days ago the automatic movers learned to leave a dated piece alone when it
names its own next step (backlog item P071). Checked again today, it holds: over
the 14 rows on main, the automatic mover offers 5 pieces, and none of them
contains "next" or "misses". Before the fix, 3 did.

The other path had no check. When a run named a piece itself with `--history`,
the tool removed that exact text from the row and appended it to `HISTORY.md`.
On 23 November a run did this with the sentence above. The open step ended up
in the history file, and the run had to copy it back into `NEXT.md` by hand
(its run record says so, and `ventures/xer-schedule-check/HISTORY.md` line 51
still shows the entry).

## How often it had happened

I ran the new check over every `(moved ...)` entry in `ventures/*/HISTORY.md`:
154 entries in all. Eight of them hold an open step: three in
changepoint-detector, three in league-schedule-generator, one in
xer-schedule-check and one in photo-editing. I read all eight, and none is a
false alarm. Six of the open steps had already been copied back by hand, were
still in the row or had been replaced by later work. Two had not: "a real
league's referees" and "a real league's cards" were in no `NEXT.md` and in no
row. Both are back in league-schedule-generator's `NEXT.md` now.

## The change

`--history` now refuses a piece that turns into open work partway through. That
means "next", "open", "needs", "wanted", "todo" or "not yet" after a separator,
or an open marker such as "Next:" after the piece's start. The refusal prints
the finished part as a ready flag:

```
--history: "next a commercial tool's levelled risk run to compare" is open work,
and HISTORY.md is for finished results. ... move only the result:
--history 'Risk run levelled in every run 2026-11-22 (--levelled; ...)'
```

The check applies to the `buildable:` field as well. It does not flag
"open-source" or "next-gen". Two new tests cover the refusal and those
lookalikes.

A refused move costs a run one retry. An open step filed as history stays lost
until someone happens to read the history file.
