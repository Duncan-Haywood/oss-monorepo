# Pages test perf, 2026-11-25: the suite's share-card cache was never saved

Perf track run. The heaviest real step in the runner pool is drawing share
cards that a cache was meant to keep, and the cache had no way to be written.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (2026-11-25, 627 jobs,
729 job-minutes, 282 of them checkout) and `--steps 20`:

| step | runs | job-min | median |
|---|---:|---:|---:|
| Portfolio Pages / test / "Test the site builder" | 14 | 60.2 | 232 s |
| ventures tests / "node --test in each touched venture" | 26 | 32.0 | 83 s |
| Portfolio Pages / build / "Build the site" | 18 | 17.4 | 60 s |

(CodeQL's analyze rows read 0 s median: most of its runs are skipped.)

Job 139167629580 (PR run, 2026-11-25 11:20 UTC), TAP `duration_ms` per test:
the first test to await the shared build ("no test payload, CLI source, or
repo bookkeeping is published") took **289.6 s** of a 348 s step;
custom-domain's fixture build 86.5 s ran beside it.

The same job's log, step "Restore the share cards":

```
key: test-share-cards-350695ad…-20261125
restore-keys: test-share-cards-350695ad…-
              share-cards-350695ad…-
Cache hit for restore-key: share-cards-350695ad…-20261125
```

The prefix `test-share-cards-<hash>-` matches an entry from any day, and it
matched none: no test-card entry existed for this hash. The fallback is the
deploy's cache, whose cards are drawn for the live origin; the suite builds
for `https://example.test/site/`, and each card prints its site address, so
every card the suite needs is a miss.

Why nothing saved it: `test` saves only when `github.event_name !=
'pull_request'`, and its job `if` skips `push` (on purpose since 2026-10-30, to
stop re-running the suite on every merge). That leaves the three-hourly
`schedule`. Its runs share the `portfolio-pages-refs/heads/main` concurrency
group with every merge, wait behind the running push run, and are replaced by
the next push. The Actions API lists today's four scheduled runs (00:53,
03:44, 06:48, 09:44 UTC) as `cancelled`, all four.

Local, 4 cores, Node 22.23, `node --test "*.test.mjs" "cloudflare/*.test.mjs"`
in `platform/pages`:

| card cache | wall | shared build (first test) |
|---|---:|---:|
| empty (what CI has now) | 339.7 s | 260.0 s |
| warm (second run, same `PAGES_CARD_CACHE`) | 176.6 s | 102.0 s |

The cold local run (340 s) matches CI's 348 s step, which supports the claim
that CI runs cold.

## Change (`.github/workflows/priv-portfolio-pages.yml`)

A `test-cards` job, push events only, `contents: read`, no secrets:

1. a sparse, `blob:none` checkout of the three files the key hashes
   (`sharecard.mjs`, `fontraster.mjs`, `fonts/`);
2. `actions/cache/restore` with `lookup-only: true` for today's exact
   `test-share-cards-<hash>-<day>` key;
3. on a hit (every push but the day's first) every other step is skipped;
4. on a miss: `git sparse-checkout disable`, the same restore and the same
   `node --test` command as `test`, then the same prune and save as `test`.

Nothing in `test`, `build` or the deploys changed. I did not give scheduled
runs their own concurrency group, which would have been the smaller edit:
that would let a scheduled build of an older `main` deploy after a newer
push's, and deploy ordering is not something a perf change should move.

What it costs: one small job per push (the sparse checkout and one cache
lookup), plus one full suite run a day, more if several merges land while the
first one is still drawing. That run also runs the suite against `main` once
a day, which the schedule was meant to do and has not done on busy days.

## Verification

- `python3 -I platform/ci/ci_policy_check.py`: 98 unprivileged, 39 priv
  workflows checked, clean.
- `validate_workflows.py`: 137 valid. `control_plane_guard.py
  --check-coverage`: clean.
- Unit tests that read this workflow: `test_validate_workflows`,
  `test_publish_surface`, `test_pages_state`, `test_run_workflow_locally`,
  `test_pin_actions`, `test_unwired_checks`, `test_risk_review`,
  `test_session_gate` (81 passed), `platform/deploy/build.test.mjs`,
  `devstats.test.mjs`, the three `platform/pages` suites that name it: all
  pass.
- The suite itself is unchanged, so its output is unchanged. The cache holds
  cards keyed by what they are drawn from (`share.mjs`), so a restored card is
  the bytes a fresh draw would make.

## After number: read it on the next PR

Once a push has run `test-cards` (its log says "Cache saved with key:
test-share-cards-…-<day>"), a PR's `test` log should say `Cache restored from
key: test-share-cards-…`, not `share-cards-…`. The metric is "Test the site
builder" median seconds (`ci_profile.py --steps 20`): 232 s before. The local
ratio says it should land near half that, about 120 s.

## Not changed, ranked for the next run

1. **The scheduled runs never run on busy days.** So the three-hourly
   dashboard refresh and the merge-skew run against `main` both depend on a
   quiet moment. Worth a decision outside the perf track: their own group with
   a deploy guard that refuses to publish a sha older than the live one.
2. **P063** (ventures-tests sparse checkout): not safe now. Since 2026-11-13
   that job also runs `unwired_checks.py` (every tree-wide `check_*.py`, the
   platform node suites, `doc_index.py check`), and a sparse tree would narrow
   what they check. Four stalled drafts (PRs 13748, 13868, 14240, 14251)
   predate this. It first needs the unwired checks in their own full-tree job.
3. **The warm full build is a flat profile** (60 s standalone):
   `finishPagesInOneWalk` 10.4 s, `writeSection` 8.3 s, `shareTagsFor` 5.1 s,
   `addOfflineSupport` 4.7 s inclusive; `writeFileUtf8` 6.8 s self. Earlier
   passes took the easy wins in each.
4. The checkout-heavy guards (CI policy 87%, Conflict markers 82%, Security
   gate 59% checkout) are all `priv-*`. The required gates are among them;
   each needs its own careful PR.
