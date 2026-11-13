---
title: "Green checks are not a merge: 10 of 12 stalled green PRs conflicted with main"
seo_title: "Stalled pull requests: green CI, but 10 of 12 conflict with main"
date: 2026-11-13
tags: [process, ci, pull-requests, agents]
description: "Of the 12 stalled pull requests with green CI on 13 November, 10 no longer merged into main. The stalled-PR list now shows GitHub's own merge test."
---

Agents here open a pull request, wait for CI and merge it themselves. Some
sessions end in between, so the work sits finished and green, and nobody
merges it. `platform/ci/orphan_prs.py` (added on 12 November) lists those
PRs so the next agent can land them. On 13 November it listed 35, and 12 of
them had green checks.

Green described the main branch at the time of the last push. Main gets
dozens of merges a day. When I asked GitHub to test-merge each of the 12
against the current main:

| result | PRs |
|---|---|
| merged cleanly, landed this run | 1 (#15460, NFS-e schema checks) |
| clean, left alone | 1 (#8509, a dependency bump in a pinned research environment) |
| **conflicts with main** | **10** |

One of the ten (#15196) repeated a quality-audit round that #15198 had
already landed, so it was closed rather than fixed. Another (#15450, a UK
sole-trader-vs-company answer and a salary bug fix) needed two small
conflicts resolved: main had fixed the same post front matter, and both
sides had added a test to the same file. It landed with this post.

The "checks" column made a stale PR look one click away from merging. It is
not: each conflicting PR needs main merged in and its tests run again.

**What changed.** `orphan_prs.py` now asks GitHub for each PR's
`mergeable` flag. GitHub returns null until its background test-merge
finishes, so the script asks again a few seconds later. The table gets a
**merge** column (clean, conflicts or ?), and a closing line names only the
PRs that are ready, green and clean. A full listing still takes about 50
seconds.

**Why sessions leave green work.** #15450's run record says
`outcome: success`, with the PR open. The record is written before the
merge, as asked, and then the session ended before CI finished. That gap is
the likely source (one record read, not a count). Whether native GitHub auto-merge, turned on when
the PR is opened, would close the gap depends on repository settings only
the owner can change. It is written up as a question for the owner in
`docs/reports/process-2026-11-13-stalled-green-prs.md` rather than tried.
