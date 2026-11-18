---
title: "Which owner-gated files the agents trip on, and which have no fix waiting"
seo_title: "Ranking owner-gated files by agent doc friction"
date: 2026-11-17
tags: [process, agents, tooling, governance]
description: "52 owner-gated files drew doc friction from agent runs in a week; 35 have no fix waiting. owner_held_prs.py --friction now ranks them."
---

The agents that work in this repository may not merge changes to their own
instructions. Prompts, `CLAUDE.md` files, hooks and CI workflows are listed in
`.github/CODEOWNERS`, and a pull request that touches them waits for the
owner. That rule is there to stop a rogue agent rewriting its own guardrails.
The cost is that a wrong or stale line in a prompt stays wrong until the owner
gets to it. Every run that reads the line meanwhile reports it again in its
`doc_friction` notes.

There are 63 such pull requests open today. `owner_held_prs.py` already
listed them oldest first. Oldest first is not the order that helps most,
though, so the tool now has a second view:

```
python3 platform/ci/owner_held_prs.py --friction --days 7
```

It counts, for each owner-gated file, how many distinct run sessions reported
friction on it in the last seven days. Next to each file it lists the held
pull requests that change that file.

## What it showed on 2026-11-17

- **52 owner-gated files** drew at least one friction report in the week.
  **35 of them have no held pull request.** No agent has proposed a fix for
  those, so nothing is waiting for the owner to approve.
- The root `CLAUDE.md` leads with 441 sessions. Most of those reports are
  about the cloud container (which Python has numpy) and are not really about
  the file.
- The creative track prompt (`prompts/creative/prompt-0.md`) is fourth, with
  125 sessions and **no held PR**. It tells a run to pick the story shelf
  "that has gone longest without a new piece" by reading `git log`. That fails
  twice over. A cloud clone is shallow and shows three or four commits, and
  every shelf now gets a new piece every day: For Other Minds got 38 in the
  last week, Little Lamps 41, Saints by Candlelight 50 and Hearth & Horizon 67.
  A tool that answers the question from the stories' own `published:` dates,
  `platform/ci/creative_due.py`, has existed since 15 November. The prompt
  doesn't name it, so the runs that follow the prompt don't use it.
- `prompt.md` has six held PRs. Three of them make the same step 0 fix, so
  one review would close several.

## The mistake that led here

I nearly built a second copy of `creative_due.py`. The friction pointed at a
missing tool, I wrote one with tests, and only then found the original
mentioned in the Hearth & Horizon README. The friction didn't come from a
missing tool. It came from a gated prompt that never mentions the tool, and no
one had proposed that edit. The new view separates the two cases: a file with
reports and a held PR needs review, and a file with reports and no held PR
needs someone to propose the fix.

The counts come from the run records in `prompts/runs/`. They are distinct
sessions, not distinct problems, and some reports describe behaviour that is
working as designed. Treat the table as a reading order for the owner's
review, not as 35 confirmed bugs.
