---
title: "Fifty-six pull requests waiting on one person, and a list that shows them"
seo_title: "56 agent PRs waiting on owner approval, and the list for them"
date: 2026-11-13
tags: [process, agents]
description: "56 of 102 open PRs here touch owner-approved paths. The median has waited 9 days, and 36 share a file with another. A new script lists them."
---

Agent sessions in this repository merge their own pull requests. There is one exception. A PR that changes the files steering every agent (prompts, agent instructions, hooks, CI workflows, all listed in `.github/CODEOWNERS`) waits for the owner to approve it. That gate exists to stop a misbehaving agent from rewriting the rules for every later session.

The gate works, and the queue behind it has grown. Until today nobody could see how long it was.

## The count

A new script, `platform/ci/owner_held_prs.py`, reads every open PR and its file list. It keeps the PRs that touch an owned path. This morning (2026-11-13) it found:

- **102** open PRs, **56** of them waiting on the owner;
- a median wait of **9 days**: 33 have waited over a week, 9 over two weeks, and the oldest 36 days;
- **36** of the 56 share an owned file with another held PR. Five PRs change `portfolio-validate.yml`, five change `ventures-tests.yml`, and six change `prompt.md`;
- **37** are *mixed*: their product, docs or research work is stuck behind a one-line workflow edit they also carry.

Some of those are plain duplicates. Four PRs implement the same backlog item, a sparse checkout for the ventures test job (#13748, #13868, #14240, #14251). Three implement the same `ideas.py` change. Three reword the same step of the master prompt, and main already has that fix. #12885's text is on main word for word, so it has nothing left for the owner to approve.

## Why duplicates pile up

The usual check against duplicate work is to search open PRs before you start. That doesn't help here. A session finds a fault, sees the fix is in a control-plane file, opens a small PR as the docs advise, and moves on. The next session meets the same fault, because the fix hasn't merged. Its search for open PRs uses different words, finds nothing and opens another. Each PR is reasonable on its own. Together they cost the owner more reviews, all for the same change.

It cost something earlier too. Two days ago [we found](2026-11-11-the-review-that-never-came.md) that three held review PRs had stopped the prompt review loop. The fix for that is itself one of the 56 (#14686).

## What the list does

```
python3 platform/ci/owner_held_prs.py                  # the queue, oldest first
python3 platform/ci/owner_held_prs.py --grep ideas.py  # is my fix already waiting?
```

It prints one table, oldest first, and three sections under it:

- **Same file, several PRs.** For the owner, review those together. For an agent, the PR that already holds your fix.
- **Already on main.** Main already carries every block of lines the PR adds, compared with whitespace collapsed so a rewrapped copy still counts.
- **Mixed.** The work an owner approval would also release.

It reads only. It closes nothing and comments on nothing. Which duplicate to keep is a judgment about each diff, and that judgment belongs to the owner or to a session that reads them.

## Limits

The "already on main" test is textual. A PR whose lines all appear elsewhere in the file would count, even if it meant to move them. So the list says to check the diff before closing. The script's tests run locally (`python3 -m unittest test_owner_held_prs` in `platform/ci`). Wiring them into a workflow means editing `.github/`, and that would make PR number 57.
