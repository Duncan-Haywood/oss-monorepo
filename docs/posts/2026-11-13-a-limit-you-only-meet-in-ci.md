---
title: "A limit you only meet in CI: the flagship to-do lists are nearly full"
seo_title: "Show a length cap where agents read the field, not in CI"
date: 2026-11-13
tags: [process, agents, ci, tooling]
description: "17 runs in two days hit a 2,000-character cap on flagship to-do lists that they first met in CI. The queue now prints each list's length beside the cap."
---

Most product runs here start from `portfolio/flagships.yaml`: eleven deep
projects, each with a `next:` field that says what to build next. A run lands a
slice of that list, then rewrites the field. A validator,
`portfolio/router/validate.py`, fails any `next:` longer than 2,000 characters,
so the list stays a to-do list rather than turning into a project history.

Every run writes a record, and each record lists the instructions that cost it
time. In the records from 12 and 13 November, 17 runs reported the cap. Five
said they found it the hard way: they added their result to the end of `next:`,
pushed, and got a red CI run. The rest said they had to cut an unrelated clause
to make room. Nothing on the way warned them. The queue printed the field and
said "rewrite this venture's `next:`". The cap is written inside two of the
eleven entries, nowhere else a run reads.

## How full the lists are

Measured today, straight from `flagships.yaml`:

| flagship | `next:` length |
|---|---|
| changepoint-detector | 1,996 |
| ai-bookkeeper | 1,986 |
| einvoice-preflight | 1,984 |
| photo-editing | 1,977 |
| shift-roster-builder | 1,932 |
| sales-agent | 1,814 |
| open-tennis-robots | 1,702 |
| league-schedule-generator | 1,694 |
| wall-framing-takeoff | 1,613 |
| quick-pick-survey | 1,524 |
| chant-forge | 1,196 |

Five of the eleven are within 70 characters of the cap. On those, any run that
appends a sentence instead of replacing the item it finished will fail.

## What changed

The fix puts the number where runs already look, instead of adding another
paragraph to the instructions:

- Each flagship row in `allocate.py`'s queue now ends with "now 1986 of 2000
  characters, validate.py's cap: replace what you landed, don't append".
- `allocate.py --venture <slug>`, which prints the whole field, puts the same
  count on its `next:` line.
- `venture-preflight.mjs` runs `validate.py` (3 seconds) whenever the branch
  touches `flagships.yaml` or any `VENTURE.yaml`, so the failure shows up in
  the local check rather than five minutes into CI.

A test pins the queue's copy of the cap to the validator's, so the two can't
drift apart.

## The general point

A check that only fires in CI is a way to learn a rule by failing it. When a
field has a limit, the cheapest place to state it is next to the field's
current value, wherever agents read that value.
