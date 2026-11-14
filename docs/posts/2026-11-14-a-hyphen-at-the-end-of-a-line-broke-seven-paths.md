---
title: "A hyphen at the end of a line broke seven paths in our work queue"
seo_title: "A YAML folded-scalar hyphen broke seven paths in our work queue"
date: 2026-11-14
tags: [process, agents, yaml, tooling]
description: "YAML folds a line break to a space, so a hand wrap after 'wall-framing-' read back as 'wall-framing- takeoff'. A small editor and a check fix it."
---

Every venture session in this repository starts from one file,
[`portfolio/flagships.yaml`](../../portfolio/flagships.yaml). Each of its
eleven deep projects has a `next:` field: the open work, most valuable first,
capped at 2,000 characters. A session that lands a slice rewrites that field
in the same pull request.

The field is a YAML folded scalar (`next: >-`), wrapped at about 78 columns.
In a folded scalar a line break becomes a space. So when someone wraps a long
path by hand after its hyphen,

```yaml
    next: >-
      History: ventures/wall-framing-
      takeoff/README.md and ROADMAP.md
```

the value an agent reads is `ventures/wall-framing- takeoff/README.md`, a path
that does not exist. A scan of today's file found seven of these breaks in
four projects' `next:` fields, among them that path and
`docs/INFORMATION-GAIN- SELECTOR.md` in quick-pick-survey. The second one had
already been unfolded and copied forward with the stray space still in it.

## What the run records said

Run records list where the instructions got in a session's way
(`doc_friction`). Today, five sessions said editing a `next:` was hard. A
plain string replace fails whenever the text to change runs over a line break.
So each session unfolded the field, edited it and wrapped it again by hand,
which is how the broken joins got in. Two other sessions said the router's
"Start here" line names a flagship but never mentions the website-request
queue, which `prompt.md` ranks first. They had to work out by hand that the
open requests are mostly the same projects.

## The fix

- `portfolio/router/flagship_field.py <venture> --replace OLD NEW` matches the
  *unfolded* text and rewraps the field with hyphen breaks turned off. It then
  reads the file back to prove the value round-trips exactly, and it refuses a
  `next:` over the cap. `--set FILE` replaces the whole field. With no flags it
  prints the field and its length.
- `validate.py`, which CI runs on every change to the file, now fails on a
  folded line that ends in a word followed by a hyphen.
- The router's per-row hint points at the tool, and a new line above the table
  maps open requests to flagship rows. All five requests come from the owner.
  Three of them (R-0001 to R-0003) are rows 1, 10 and 11, and two
  (monetization, the clothing studio) are not flagships.

The seven broken joins were repaired with the tool. A YAML-level diff shows
the values changed only at those joins, plus one double space.

The lesson for a repository that agents edit: if the same small edit keeps
coming up as friction, give it a tool. Then add a check that catches the
damage done before the tool existed.
