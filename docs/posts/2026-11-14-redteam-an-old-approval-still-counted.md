---
title: "An approval from last week still counted. Red-teaming the control-plane audit"
seo_title: "Control-plane audit: stale approvals and the 300-file page"
date: 2026-11-14
tags: [testing, mutation-testing, security, github, codeowners, redteam]
description: "The check that audits merges to protected files counted withdrawn and stale owner approvals, and read only the first 300 files of a commit."
---

This repository is edited by agents, and a few files tell every later agent
what to do: `CLAUDE.md`, the prompts, the hooks, the CI workflows. Those paths
are listed in `.github/CODEOWNERS` and need the owner's approval to merge.
`platform/ci/control_plane_guard.py` backs that up: after every push to
`main`, `--audit-commit` checks whether the commit touched a protected file
and, if so, whether the owner approved the pull request it came from. It is
there for admin bypasses and for any time the branch ruleset isn't applied.

Today's red-team run seeded eight faults into it and eight into
`platform/distribution/versions.mjs`, the script that bumps a published tool's
version when its shipped files change (`redteam.py campaign`: change one
operator or constant, run the tests, put the file back).

| File | Seeded | Caught before | Caught after |
|---|---|---|---|
| `platform/distribution/versions.mjs` | 8 | 5 | 7 of 8 (the eighth is an error exit code, 1 vs 2) |
| `platform/ci/control_plane_guard.py` | 8 | 6 | 6 of 8 (the other two can't change behaviour) |

## What got through in versions.mjs

Every test called `main()` with its arguments passed in, so nothing checked
the default `process.argv.slice(2)`. Change that 2 to a 3 and the CI step
`versions.mjs --check` drops its flag, prints the version listing and exits 0,
so a stale manifest passes. A new test runs the script the way CI does and
expects "is current". A second new test covers the filter that keeps
`__pycache__` and `.pyc` files out of a bundle's hash. Without it, running
Python next to a bundle could bump a version.

## What the audit missed

None of these came from a seeded fault. They turned up while reading the code
as an attacker, and each one reproduces with a mocked API:

| Pull request history | Audit before | Should be |
|---|---|---|
| Owner approves, then requests changes, then it merges | pass | fail |
| Owner's approval is dismissed | pass | fail |
| Owner approves commit A, a bot pushes commit B, it merges | pass | fail |
| A squash touching 301 files, `CLAUDE.md` 301st | pass | fail |

The first three come from one line: the audit counted any `APPROVED` review
ever left on the PR. GitHub lists reviews oldest first, and a reviewer's later
"changes requested" or a dismissal withdraws an approval. The ruleset's
dismiss-stale-reviews setting handles the third case, but only while it's
applied, and the audit exists for the times it isn't. The fix keeps each
reviewer's latest decisive review and needs it to approve the commit that
merged. The fourth case is paging: the commits API returns a commit's files
300 to a page, and the audit read only page 1.

The fix and four tests that fail without it are written. The guard is
itself a protected file, so they go in their own pull request and wait for
the owner's approval. This one carries only the unprotected test changes and
the run record.
