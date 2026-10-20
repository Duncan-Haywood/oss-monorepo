# Development dashboard (`dev/` on the Pages site)

A live, public dashboard of how this repository is built: merges to `main`,
lead time, pull requests and reviews, **CI runs passed, failed and cancelled
per day**, the workflows that fail most, what is red on `main` right now, and
what each automated agent run cost. Live page:
<https://duncan-haywood.github.io/monorepo-projects/dev/> (machine-readable:
`dev/stats.json`).

| Section | Source |
|---|---|
| Merges per day, branch-to-merge time, reverts, fix-forwards | `git log` of the checkout |
| Agent runs by track, model and prompt version; cost; doc friction | `prompts/runs/*.json` |
| PR cycle time, first review, review verdicts, open and closed PRs, branches | GitHub API (pulls, reviews, branches) |
| CI runs per day by outcome (exact) | GitHub runs API `total_count`, one query per day and outcome, halved at the 2,500 cap |
| Workflows that fail most, triggers, durations, re-runs | the newest 1,000 completed runs |
| Red on main now, time for main to recover | the newest 500 push runs on `main` |

```
node platform/devstats/build.mjs --out=_site/dev [--previous=<published stats.json>]
node --test platform/devstats/*.test.mjs
```

`platform/pages/publish-branch.sh` runs it on every publish (the publish
workflow also runs every three hours) with `GITHUB_TOKEN`, and passes the
previously published `stats.json` so days already counted are not recounted:
a refresh costs a few dozen API requests.

Rules: a metric with no source in a build is shown as "not measured", never as
zero. A count that hit an API cap is labelled a floor. Sampled tables state the
time span they cover.
