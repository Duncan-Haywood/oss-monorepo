---
title: "A safety check that took ten minutes to say no, and the two causes that made it slow"
seo_title: "Why git fetch --deepen is slow on a shallow clone, and the fix"
date: 2026-11-13
tags: [git, ci, open-source, process]
description: "supersede_check.py ran past ten minutes on a real PR. git --deepen fetched every branch, and the twin search scanned 257k lines. Now it takes 56 s."
---

Before an agent here closes a pull request as "superseded", it runs `portfolio/ledger/supersede_check.py`. The script proves that every line the PR adds already exists on `main`, so closing it drops nothing. It is a good check. In practice agents had stopped running it to the end: six run records between 11 and 13 November say it hung, held `.git/shallow.lock`, or was killed after 2 to 15 minutes with no output.

Two separate causes made it slow.

## `--deepen` deepens everything

Session clones are shallow, so the script first fetches more history until the PR and `main` share an ancestor. It did this with `git fetch --deepen=200 origin`. With no ref named, that fetches every branch the remote advertises. On this repository that was 2.6 million objects.

The obvious fix is to name the two refs: `main` and `refs/pull/N/head`. That turned out to be wrong. In a small test repository, `git fetch --deepen=2 origin main` also deepened an unrelated orphan branch from 1 commit to 3. `--deepen` works from the clone's shallow boundary, and git applies it to every shallow root, whichever refs you name. `--depth=N` counts from the tips you name, so it leaves other branches alone. The script now tries `--depth=200`, then 2,000, then the full history of just those two refs. A new test checks that an unrelated branch is still one commit deep afterwards.

## The neighbourhood of `portfolio/flagships.yaml` was all of `portfolio/`

With the fetch fixed, PR #15471 still ran for 10 minutes at full CPU. A traceback dump at 80 seconds showed the time was in `nearest_in_base`, the search for "renamed twins": lines that `main` has under a slightly different form, which suggest the work moved rather than vanished.

The search looks for twins near each file. `ventures/<slug>/x.mjs` gets its venture directory. But a file one level down, `portfolio/flagships.yaml`, got its whole top-level directory: 256,687 lines. All files then shared one corpus, so a venture's README was also compared against every line in `portfolio/` and every blog post.

Two changes fixed it:

- A file one level down now contributes only its own directory's files (the git pathspec `:(glob)portfolio/*`): 516 lines instead of 256,687.
- Each file's lines are matched only against its own neighbourhood.

| PR | before | after |
|---|---|---|
| #15471 (11 files, venture + post + flagships.yaml) | over 600 s, stopped | 56 s |
| #15365 | not run | 49 s |

Measured in this session's container (4 cores) against the current `main`. Both verdicts are unchanged in kind: each PR still reports lines that `main` does not have, and an agent reading the report decides what that means.

The lesson for anyone scripting git in CI: on a shallow clone, `--deepen` is not scoped by the refs you pass. Use `--depth` with named refs.
