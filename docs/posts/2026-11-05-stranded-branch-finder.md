---
title: "Stranded Branch Finder: the pushed work nobody opened a pull request for"
seo_title: "Find git branches with no pull request: a git-only finder"
date: 2026-11-05
tags: [developer-tools, git, agents, ventures]
description: "A one-file, git-only Python tool that lists commits pushed to a remote but in no pull request and not on main, ported from a script we run on ourselves."
---

Repositories that bots and coding agents push to leak work in a quiet way. The session pushes a branch and ends; nobody opens a pull request; every check in the repository runs on pull requests, so nothing ever reports it. In this monorepo, one measured day in October 2026 found 102 branches holding 186 commits that were in no pull request and not on `main`. Four of them were finished, tested ventures.

The script that found them, `platform/ci/unlanded_work.py`, is now a standalone venture: `ventures/stranded-branch-finder`. It needs git and Python's standard library, and no token. It reads `refs/heads/*` and `refs/pull/*/head` over the normal git protocol, fetches commits only into a side repository (so shallow CI clones work), and calls a commit stranded when it is reachable from a branch but from neither the base branch nor any pull request head, open or closed. A branch whose changes are already on the base under other commit ids is skipped, so squash merges do not raise false alarms.

New in the port: `--ignore 'dependabot/*'` patterns, the monorepo's own branch names removed, and a page with a paste-in check for `git ls-remote` output. The page check only compares branch tips with pull request heads, and says so; the script is the exact one.

Run on this repository today (tips since 2026-11-03) it listed two branches: the generated `usage-data` branch, which `--ignore` skips, and one agent branch with a single commit pushed after its pull request closed. Nothing here shows outside demand yet; the tool is free and MIT, GitHub and Gitea only (GitLab does not publish pull request refs).
