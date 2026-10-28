# Progress posts: daily, every three days, weekly

The owner, 2026-10-24: "do an analysis of the progress, add a blog post, last
24-72 hours or so. this should be a daily thing that gets a blog post." And
2026-10-28: "let's add daily blog post updates on progress and the most
interesting things accomplished that day. also tri-daily and weekly."

`platform/daily/` already publishes a templated brief of every merge
(`dev/daily/` on the site). That brief holds no judgment. These posts are the
judgment: **the most interesting things that were accomplished**, explained so
a reader outside the repo cares, and whether the work is going where
`prompts/goals.md` and `portfolio/flagships.yaml` say it should.

| Cadence | Window (complete UTC days) | Tags | File | Scheduled |
|---|---|---|---|---|
| daily | yesterday | `progress-report`, `daily-progress` | `<today>-progress-daily-<slug>.md` | every day |
| 3day | the last 3 days | `progress-report`, `three-day-progress` | `<today>-progress-3day-<slug>.md` | every third day |
| weekly | the last 7 days (Mon to Sun) | `progress-report`, `weekly-progress` | `<today>-progress-weekly-<slug>.md` | Mondays |

The schedules are claude.ai scheduled tasks, created 2026-10-28 at the owner's
request, that start a fresh session pointed at this file: daily 02:17 UTC
(`trig_01PS6F2j1F1QTyhsDY78HsBe`), three-day 03:23 UTC on days 1, 4, 7, ...
of the month (`trig_018qu2yMVwc14CzmJQSCPWXg`; the 31st and the 1st sit two
days apart, so windows overlap a day there) and weekly Mondays 04:41 UTC
(`trig_01CeSUGeNQSxYeGyZXR8Htpb`).
Any session may write a missing edition by hand. First editions:
[`2026-10-24-progress-922-merges-zero-measured-users.md`](../../docs/posts/2026-10-24-progress-922-merges-zero-measured-users.md)
(before the cadences) and the first daily, 2026-10-28.

## Before you start

- One post per cadence per window. If a post with the cadence's tag already
  covers the window on `main` or in an open PR (`search_pull_requests`,
  `progress in:title`), stop, or extend it if it is open and missing something.
- The longer cadences are not three or seven dailies stapled together: say
  what the window adds up to (a trend, a programme that finished, a flagship
  that moved or stalled), and link the dailies for detail.

## Facts (software, not hand counts)

```
git fetch origin main --shallow-since=<window start minus a day>
node platform/daily/progress.mjs --cadence=daily|3day|weekly [--end=YYYY-MM-DD] [--json]
```

It prints merges per day, new products and research programmes, every
flagship's merges against its order, the busiest areas with their biggest
merges, reverts and fix-forwards, post counts by tag, the run records'
tracks, outcomes, cost (and how many records report it) and notes, and the
previous edition of the same cadence. Read it, then read the merges and posts
it points at: the facts say where to look, not what was interesting.

Delivery and bug rates come from `delivery`, `ci` and `github.ci_pr` in
`https://duncan-haywood.github.io/oss-monorepo/dev/stats.json` (rebuilt by
`platform/devstats` on every publish). If it says `available: false`, say so
rather than computing it by hand. Owner asks: `python3
portfolio/ledger/decision_queue.py`. If a step here becomes a chore repeated
every edition, move it into `progress.mjs` (`prompts/goals.md`, "Software
for the routine, agents for judgment").

## What the post should say

- **The most interesting things accomplished**, first: three to five for a
  daily, five to eight for the longer windows. Pick by what a reader would
  find new (a real-data result, a negative result, a new programme, a
  product doing something it could not before), not by merge count. Each
  gets a sentence of what it is, the number that makes it interesting, and
  a link to the post, page or PR.
- Throughput in one small table, then where the effort went against the
  flagships' `next` lists. A flagship merging a lot but not on its first
  `next` item, or one with zero merges, is worth pointing out.
- One or two concerns with evidence and a concrete recommendation. Check the
  previous edition's recommendations: say which moved.
- What only the owner can unblock, briefly, from the decision queue.
- No fabricated or estimated numbers presented as measured. "Unmeasured"
  is not zero.

Link pages on the site through the origin `PUBLISHED_ORIGIN` names in
`platform/pages/writing.mjs` (the build rewrites it to relative links; any
other site origin fails `platform/pages/custom-domain.test.mjs`). Keep the
description under 160 characters, date the post `date -u +%F`, and land it
like any other run (`CLAUDE.md`, "Every session lands its own work").
