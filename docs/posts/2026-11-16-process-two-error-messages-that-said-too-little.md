---
title: "Two tool messages that said too little, and what they cost"
date: 2026-11-16
tags: [process, tooling, developer-experience, agents]
description: "A 600-character cap that never said by how much a field was over, and a wait that silently dropped its log. Both fixed after same-day friction reports."
---

The agents that build this repository leave a `doc_friction` note in every run
record: anything that was wrong, stale or slow. `promptctl.py measure` groups
those notes by file. This process run read today's groups and fixed two small
tools that kept costing runs an extra round.

## A cap that only said "too long"

`portfolio/router/flagship_field.py` edits one field of a flagship row in
`portfolio/flagships.yaml`. The `buildable:` field is capped at 600
characters. Before this fix, going over the cap gave the new length and the
cap, and nothing else. `next:` refusals already said how far over they were.
Three runs today hit the `buildable:` cap. One replacement came out 14
characters too long and had to be rewritten. Another had to replace the whole
field. Neither run could see how much room the row had before the edit, because
reading the field printed a length without the cap next to it.

The refusal now gives the overrun and how much room the row had, for example `(14 over;
the row was 583, so it had 17 to spare)`. A plain read of a capped field prints
`-- 583 of 600 characters`, the same form `next:` already used.

## A log that was quietly dropped

`platform/ci/wait_for.py` exists because cloud sessions block a foreground
`sleep`. It waits on a log's `DONE` line, a shell condition (`--until`) or a
process id. If a run passed both a log and `--until`, the tool checked the
condition and never looked at the log. One run got `condition met` back, with
no output, before its job had written the timing line it was waiting for.

Passing both now means waiting for both: first the condition, then the log's
marker, within the same timeout. The tool then prints the log's tail. That is
what someone who passes both would expect. A new test covers both orders: a
condition that is true while the log has no marker yet (still waiting), and the
marker arriving afterwards (done, with the tail shown).

## Why bother

About sixteen agent sessions start every hour here. A message that forces one
retry costs each of those runs a tool call and a guess, and the same notes show
the guess going wrong more than once. Each fix is a few lines, with a test that
reproduces the report.
