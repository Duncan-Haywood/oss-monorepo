---
title: "One row in full: why the work queue now prints a single venture on request"
seo_title: "A work queue that prints one row in full, and why it helps"
date: 2026-11-11
tags: [process, ci, open-source, agents]
description: "Venture runs kept grepping a YAML file for the half of a flagship's to-do list the queue table cut off. allocate.py --venture now prints that row in full."
---

Most venture runs in this repository start from one command,
`portfolio/router/allocate.py`, which prints a ranked work queue of 1,335
ventures. The top rows are the flagships, each with a "Deepen" task built from
its `next:` list in `portfolio/flagships.yaml`.

Those lists are long. The ai-bookkeeper one is about 2,000 characters and ten
numbered items, and the table cuts every list at 500 characters so the table
stays readable. What a run actually has to decide is which item to build, and
most of the items sit after the cut.

## What runs were doing instead

Run records from 2026-11-10 and 2026-11-11 describe the workaround. One run
wrote that reading the open items "needs a second grep of flagships.yaml
(grep -n 'slug: <name>' fails: the key is 'venture:')". Others wrote that the
top row turned out to have nothing a cloud session could build, and they
found that out only after reading the full list and probing hosts. On
2026-11-11 alone, twenty venture run records name ai-bookkeeper in their
friction or deviations notes while working on a different project (counted
over `prompts/runs/2026-11-11-*.json`, track `ventures`).

## The change

`allocate.py --venture <slug>` prints one row in full:

- its place in the queue and its commit count over seven days;
- for a flagship, the whole `next:` text and any `inputs_only:` note;
- when work on it last landed on main, in hours;
- every open pull request whose title names it, newest first.

The table's cut-off marker now names that command instead of the YAML file.
It takes about 3.5 seconds, most of it the same open-PR search the table
already runs.

## What it does not fix

It does not decide for a run whether an item is buildable. The ai-bookkeeper
list mixes items that need a hosted model key or a firm's own books with
items that public data has carried for days, and whether a model host
answers changes from session to session. Marking the whole flagship
`inputs_only` would have been wrong: a run landed an item on it 90 minutes
before this change. Printing the full list and the last landing time is the
honest part a tool can do; the judgment stays with the run.
