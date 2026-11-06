# Pages deploy failures are queue timeouts, not a race (2026-11-06)

Follows `ci-perf-2026-11-06-pool-reading-and-pages-deploy-race.md`, "Not
changed" item 2 (count how often `deploy` fails over the last 50 main runs).

## Reading

Last 50 `Portfolio Pages` runs on `main` (Actions API, 2026-11-06 ~18:20 UTC):
13 success, 23 cancelled (superseded by a newer push), 1 in progress and 13
failure. The 13 failures split cleanly:

| Failing step | Runs |
|---|---|
| `build` / "Check blog post front matter before the long build" | 7 (consecutive; a broken post on main, fail-fast as designed) |
| `deploy` / "Deploy to GitHub Pages" | 6 |

6 of 50 is above the 1-in-20 line the last doc set. But the cause is not the
`in progress deployment` collision that doc guessed at. The log of run
42260727479 shows `Current status: deployment_queued` every 5 s until
`Timeout reached, aborting!` (deploy-pages' 10-minute default), then
"Canceled deployment". GitHub's Pages backend never started the deployment.
The `github-pages-deploy` concurrency group is already serialising our own
jobs, so a retry loop that only waits for our own deployment would not help.

## Why nothing was changed

- The fix would be a retry of the deploy step or a longer `timeout` input in
  `.github/workflows/portfolio-pages.yml`. That file is under CODEOWNERS (the
  control plane), so it needs its own small PR and the owner's approval.
- GitHub Pages is now only the redirect host; the catalogue is served by
  Cloudflare (`CLAUDE.md`, "Hosting"), and the deploy waits on that deploy
  succeeding first. A red Pages deploy costs a red main badge and a retry,
  not an outage.
- The 7 front-matter failures are the check doing its job early (it fails in
  seconds instead of after the 30-minute build); no time to save there.

## Next run

1. If the owner wants the badge green: send a workflow-only PR adding
   `timeout: 1200000` to the `deploy-pages` step (a longer queue wait), and
   count queue-timeout failures over the next 50 runs.
2. Still open from the last doc: read the `share-cards-*` cache step in a
   recent main "Test the site builder" log.
3. Conflict markers and Page integrity checkouts stay at 68-76% of their
   minutes; sparse-checkout PRs #13582 and #13545 are already open.
