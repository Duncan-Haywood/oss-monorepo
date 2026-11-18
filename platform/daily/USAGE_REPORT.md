# Usage-and-income reports (`docs/posts/*-usage-and-income-*.md`, `usage-report*.mjs` here)

A daily and a weekly blog post on how use of the site and income are going
(owner request, 2026-11-02). Each is composed only from committed files, so
the numbers in a post can be checked against the tree at that commit.

| Source | Gives |
|---|---|
| `portfolio/usage/site-visits.json` | page loads per UTC day and page; referring-site kind, country, device; crawler beacons |
| `portfolio/usage/site-feedback.json` | how many feedback-form messages arrived (counted, never quoted) |
| `portfolio/usage/income.json` | payments the owner has written down (Sponsors and coffee balances are not readable from here) |
| latest `portfolio/ledger/YYYY-MM.yaml` | `mrr_end` per venture |
| `.github/FUNDING.yml` | which ways to pay are open |

```
node platform/daily/usage-report-build.mjs --today=2026-11-02            # daily post for 2026-11-01
node platform/daily/usage-report-build.mjs --today=2026-11-02 --weekly   # plus the week 2026-10-26..2026-11-01
node platform/daily/usage-report-build.mjs --dry-run                     # print, write nothing
node --test platform/daily/usage-report.test.mjs
```

A post is dated the day it is written and covers complete UTC days before
it. An existing post is left alone unless `--force`.

Rules the code keeps, because a report that overstates is worse than none:

- A day before the counter's first row is **not counted**, never zero; a day
  after it with no row is a counted zero.
- A breakdown that started later than the page counts (country and device on
  2026-10-30, crawler beacons the same day) says how many loads it covers.
- A weekly change is only given against a fully counted week before.
- Page loads are not people; crawler beacons are not page loads.

## Running it every day

The data comes from `site-usage-pull.yml`, which pulls the counter at 05:23
UTC. Since 2026-10-31 that job fails at its last step: it pushes straight to
`main`, and the repository ruleset now answers "Changes must be made through a
pull request" (run 41276810850). So the committed `site-visits.json` stopped at
2026-10-30 while the counter kept counting. The fix, and a step that runs this
generator after the pull (daily, plus `--weekly` on Mondays), belong in that
workflow, which is a control-plane path (`.github/CODEOWNERS`) and so goes in
its own PR for the owner's approval. A plan for that PR, from the ruleset in
`.github/rulesets/main.json` (squash PRs only; required checks
`conflict-markers` and `control-plane`; code-owner review only on owned paths,
which `portfolio/usage/` and `docs/posts/` are not):

1. after the pulls, run `node platform/daily/usage-report-build.mjs`, adding
   `--weekly` when `date -u +%u` is 1;
2. commit to a branch `usage-data/<date>` instead of `main` and push it;
3. `gh pr create` with the job token (`pull-requests: write`; needs the
   repository setting that lets Actions create pull requests);
4. `gh workflow run conflict-markers-ci.yml --ref <branch>` and the same for
   `control-plane-guard.yml` (`actions: write`), because a PR opened by the job
   token starts no workflows by itself, but a dispatch does;
5. `gh pr merge --squash --auto`.

Until then a session can refresh the data and write the posts by hand:

```
COUNTER_URL=$(node -p 'require("./platform/counter/site.json").url') node platform/counter/pull.mjs
node platform/daily/usage-report-build.mjs [--weekly]
```
