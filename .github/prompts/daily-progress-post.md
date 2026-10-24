# Daily progress analysis post

The owner, 2026-10-24: "do an analysis of the progress, add a blog post, last
24-72 hours or so. this should be a daily thing that gets a blog post."

`platform/daily/` already publishes a templated brief of every merge
(`dev/daily/` on the site). That brief deliberately holds no judgment. This post
is the judgment: whether the work is going where `prompts/goals.md` and
`portfolio/flagships.yaml` say it should, what is stuck, and what would move
things most. First edition:
[`docs/posts/2026-10-24-progress-922-merges-zero-measured-users.md`](../../docs/posts/2026-10-24-progress-922-merges-zero-measured-users.md).

## Before you start

- One post a day. If `docs/posts/<today>-progress-*.md` exists on `main` or in
  an open PR (`search_pull_requests`, `progress in:title`), stop: extend it
  only if it is still open and missing something.
- The window is the last 24 hours. Widen it to 72 when a day was quiet or to
  show a trend, and say which window you used.

## Numbers (all from files, none typed by hand)

The clone is shallow: `git fetch origin main --shallow-since=<window start minus a day>`.

```
export TZ=UTC
git log origin/main --first-parent --since=<start> --date=format-local:%Y-%m-%d --format=%cd | sort | uniq -c   # merges per day
git log origin/main --first-parent --since=<start> --format=%s | sed -E 's/:.*//' | sort | uniq -c | sort -rn  # by title prefix
git log origin/main --first-parent --since=<start> --format=%s | grep -ic '^revert'
git ls-tree -d --name-only <start-commit> research/ | wc -l   # vs origin/main: new research projects
python3 portfolio/ledger/decision_queue.py | grep -E '^[0-9]+\. '
grep -c 'live_url_visitors: null' portfolio/usage/usage.yaml
python3 platform/ci/figureless_projects.py | wc -l
```

From `prompts/runs/*.json` dated in the window: counts by `track` and
`outcome`; `cost_usd` and `wall_minutes` (state how many records report
them, and never extrapolate past that); `integrity_issues`;
`redteam.campaigns` and `redteam.real_defects`; files most named in
`doc_friction`; notes that report duplicated work.

## What the post should say

- Throughput in one table, then **where the effort went against the
  flagships' `next` lists**. A flagship that is merging a lot but not on its
  first `next` item is the most useful thing to point out.
- Two or three concerns, each with the evidence and one concrete
  recommendation. Check the previous edition's recommendations: say which
  moved and which did not.
- What only the owner can unblock, from the decision queue, without
  restating every item.
- No fabricated or estimated numbers presented as measured. "Unmeasured"
  is not zero.

Tag it `progress-report`, name it `<date>-progress-<slug>.md`, keep the
description under 160 characters, and land it like any other run
(`CLAUDE.md`, "Every session lands its own work").
