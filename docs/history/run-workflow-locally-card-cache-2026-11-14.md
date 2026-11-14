# run_workflow_locally, 2026-11-14: a kept share-card cache, and deploy jobs that stay skipped

Process track, Critique mode. The backlog held only owner rows.
`python3 platform/ci/friction_rank.py --live` ranked
`platform/ci/run_workflow_locally.py` 14th: 12 sessions from 2026-11-10 to
2026-11-14 said `--for-changes` on a venture, post or research diff selected
portfolio-pages.yml, whose "Test the site builder" step outran the sweep's
300 s per-workflow budget and gave no verdict.

## Why the step was slow here and not in CI

CI restores the share cards into `${{ runner.temp }}/share-cards` with
`actions/cache/restore` and points `PAGES_CARD_CACHE` there. Locally
`runner.temp` was a fresh `mkdtemp` per process and the `uses:` step was
skipped, so every local run drew all the cards again. Each run also left
about 350 MB of cards behind in `/tmp`.

Measured in this 4-core container (scratch scripts, not committed):

| what | cold cache | warm cache |
|---|---|---|
| one `buildSite()` | 111 s | 47 s |
| `node --test "*.test.mjs" "cloudflare/*.test.mjs"` (1,659 pass) | 330 s | 279 s (cache warm for one base URL only) |
| the same step inside `run_workflow_locally.py portfolio-pages.yml` | 330 s | **116 s** (cache warm for every build the suite makes) |

Per file, cold: `build.test.mjs` 265 s (its first test waits 233 s on three
concurrent full builds), `custom-domain.test.mjs` 77 s, everything else
under 10 s.

## Change 1: a local stand-in for `actions/cache`

`local_cache_dirs()` links each `${{ runner.temp }}/<path>` that an
`actions/cache` or `actions/cache/restore` step names to
`~/.cache/run_workflow_locally/actions-cache/<path>`, which outlives the
process. The skip note says so: `uses: step, not run: (local stand-in:
share-cards kept in ...)`. A restored cache must already tolerate stale
contents (restore-keys hand back older entries), and the cards are keyed by
what they are drawn from, so a kept directory is no less safe than CI's.
Paths outside `runner.temp` are left alone. The first run in a new container
is still cold (330 s); the second and later runs are not.

## Change 2: `if:` conditions with a parenthesised `||`

Found while timing change 1. `false_on_pull_request` gave up on any `if:`
containing `||`. portfolio-pages.yml's `deploy` job reads
`!cancelled() && ... && (needs.gate.outputs.cloudflare != 'true' || ...) &&
github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && ...`,
so `run_workflow_locally.py portfolio-pages.yml` ran the deploy job, and its
"Announce the deployed site to IndexNow" step reached `indexnow.mjs --submit`.
It failed only because the artifact it unpacks did not exist. `&&` is now
split outside parentheses and quotes; a top-level `||` still means unknown.

Steps that no longer run locally, compared with origin/main's version over
every workflow: portfolio-pages' `deploy` and `deploy-cloudflare` jobs
(Worker deploys, IndexNow submits, site verification) and its main-only
`build` steps; branch-cleanup's "Delete the merged PR's head branch";
control-plane-guard's merged-commit audit; real-estate-agent-photo-app's
Cloudflare Access apply. CI runs none of them on a pull request.

## Not changed

- The 300 s default budget. With a warm cache the workflow fits; a cold first
  run still does not. Raising the default is the next lever if reports go on.
- The pages builds' own `/tmp/pages-*` directories (299 of them in this
  container after a few runs) are not cleaned up by the tests. Worth a perf run.

Tests: `python3 -m unittest test_run_workflow_locally` (in `platform/ci`),
181 pass.
