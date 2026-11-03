# Sibling links CI: sparse checkout (2026-11-03)

## Reading

`python3 platform/ci/ci_profile.py --runs 200 --top 15`: 197 jobs, 216.2
job-minutes, checkout 116.5 (54%). Sibling links: 12 jobs, 17.4 job-minutes,
median job 70 s, checkout median 64 s (90%); its two steps run a few seconds.

## Change

`sibling-links-ci.yml` checkout gains `filter: blob:none` and a non-cone
sparse checkout: `/platform/`, `/portfolio/`, `package.json` and the page,
code and config files under `/ventures/` (`*.html`, `*.mjs`, `*.cjs`, `*.js`,
`*.json`, `*.yaml`, `*.yml`). Same technique as `ci-perf-2026-11-03-prompts-sparse.md`.

## Verification

Local worktree with those patterns: 205 MB working tree against 1.1 GB.
`node --test platform/pages/siblings.test.mjs` 20 pass, 0 fail;
`siblings.mjs --check` "ok: 0 orphan(s)"; `siblings.mjs --json` md5 identical to
the full tree (a2d7d76f...). First attempts with only `*.html` failed on
`ventures/hearth-and-horizon/stories.mjs` (imported by build.mjs), which is why
code files are included. The checkout-time gain is not measured here (local
remote ignores the blob filter); read it from `ci_profile.py` on later runs.

## Not changed (ranked)

1. Portfolio validate (31 job-min, checkout 33%) needs a per-step audit.
2. agent-permission-harness CI (checkout median 76 s of 101 s).
3. ventures tests, Page integrity (checkout 40 to 51 s).
