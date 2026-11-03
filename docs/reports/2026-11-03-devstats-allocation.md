# Dev dashboard: where runs go, and where the next ones go (2026-11-03)

Owner ask: "more work on the dashboard to see where dev resources/runs are
going over different time periods and where the next ones are going".

## What landed

- `platform/devstats/allocation.mjs`: `fromAllocation(repo)` builds
  `stats.allocation`, which holds runs per period (today, 7 d, 30 d, all) by
  portfolio, track and project; runs per day by track over 30 days; and `next`,
  which holds routing weights beside the share each track got in the last
  7 days, the expected runs per track, whether a review is due, and the
  product and research lanes with the runs each item got.
- `platform/devstats/render-allocation.mjs`: the two sections at
  `dev/#allocation` and `dev/#next`.
- Tests: `platform/devstats/allocation.test.mjs` (9).

## Attribution, and its limit in the published build

The order is: the record's `projects` field, then the prefix of the PR's
merge subject, then the most-named `ventures/` or `research/` directory in its
task, goal, notes and write-ups. With deep history 91% of all records and 97%
of the last 7 days are placed. Only 18% of records fill `projects`
themselves, so merge subjects do most of the work.
`.github/workflows/portfolio-pages.yml` checks out `fetch-depth: 3000`
(about 12 days of merges), so the published page leans on the text fallback
for its oldest days. If the 30-day column matters, raising that depth to about
8000, or deriving `projects` from the PR's diff in `promptctl.py record`, would
fix it. Both are control-plane edits (CODEOWNERS), so each belongs in its own
small PR.

## Findings worth acting on (2026-11-03)

- The last review-track record is dated 2026-10-31, with 461 runs since
  (`review_every` 40). Several "prompts: review" PRs are open and unmerged
  (PR #12367, PR #12272, PR #12026).
- Thinly served lanes last week: request R-0003 and flagship 3, `sales-agent`
  (11 runs), flagship 10, `open-tennis-robots` (2), and programme
  `sim2real-inference` (3).
- The run rate fell from about 260 a day (22-24 Oct) to 140-164 a day
  (1-3 Nov).
