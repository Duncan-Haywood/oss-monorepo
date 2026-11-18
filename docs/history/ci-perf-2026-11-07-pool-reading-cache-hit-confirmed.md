# CI perf: pool reading, share-card cache hit confirmed, venture checkout is the open lever (2026-11-07)

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (574 jobs, 2026-11-07
02:59 to 04:17 UTC): 471.9 job-minutes, checkout 110.9 (23%), setup 14.7.

| workflow | job-min | heaviest step |
|---|---:|---|
| Portfolio Pages | 199.8 | Test the site builder (81.3 min over 108 jobs, many of them fast failures) |
| Portfolio validate | 90.1 | Privacy checker unit tests (3.5 min, fixed earlier today) |
| ventures tests | 62.1 | node --test in each touched venture (48.2) |
| Conflict markers | 21.2 | checkout 72% |

## The "check the cache hit rate" item is answered

The 2026-11-06 reading ranked "check the `share-cards-*` cache hit rate in a
run log before touching the builder again" first. Two successful Pages test
jobs (run logs 128297592686 and 128290454991, `actions/jobs/<id>/logs`):

- `Cache hit for: test-share-cards-<hash>-20261107`, restored in 6 to 7 s,
  exact key (not a restore-key fallback).
- `Test the site builder` still took 3 min 34 s and 3 min 36 s warm.

So the cache works and the remaining ~3.5 min is build and test work, not card
drawing. Per-test durations in the warm log (top of the file's critical path,
`build.test.mjs`): 106.6 s the first caller of the shared site build, 24.5 s
`/compare/`, 11.3 s worker cache name, 9.1 s injected assets, 7.3 s exception
footer; beside it `build-determinism` 103.5 s (two parallel child builds) and
`custom-domain` 47.6 s. Three full builds share 4 vCPU, which is why the shared
build takes 106 s in CI against about 47 s alone. Nothing here can be cut
without dropping a build, and each one tests something different. Not changed.

## Open lever: ventures-tests checkout (not done, needs the owner)

`ventures tests` jobs spend about 23 s of ~106 s in `actions/checkout` (51 058
files, 26 263 under `ventures/`, 14 435 under `research/`). The job only needs
`platform/`, `.github/`, `docs/`, `portfolio/` and the touched ventures. A
`filter: blob:none` cone checkout plus `git sparse-checkout add ventures/<slug>`
after the base fetch (disabled when BASE is empty, where every venture runs)
would skip about 85% of the files. I checked that no venture test reads a
top-level `research/` or `prompts/` path (the `research/` hits are each
venture's own subdirectory), but I did not ship it: `.github/` is in
CODEOWNERS (the PR would wait for the owner) and the blobless-fetch behaviour
cannot be exercised from this sandbox (a `file://` remote ignores the filter).
Filed as backlog P063. Expected: about 15 s on 29 jobs, roughly 7 job-minutes
of 472.

## Not changed (ranked)

1. P063, venture checkout (above).
2. Portfolio validate's remaining steps are 4 to 6 s unit suites; Adopt-stranded
   spends 1233 git subprocesses in test bodies (`squash_merge`, push, fetch).
   Batching them would change what is tested.
3. Conflict markers, Sibling links, einvoice-preflight: checkout 71 to 77% of
   a 26 to 28 s job; already the subject of the guard-checkout passes.
