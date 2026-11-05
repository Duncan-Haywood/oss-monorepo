# Perf: commit the Shed Designer pictures so Pages stops redrawing them (2026-11-05)

Track: perf. Metric: step minutes in `Portfolio Pages`, `Redraw stale Shed Designer pictures`.

## Reading

`python3 platform/ci/ci_profile.py --runs 100 --save jobs.json`, then step
durations summed per name over the 100 most recent runs (109 jobs, 84.3
job-minutes). Largest non-checkout steps:

| step (Portfolio Pages) | jobs | total s |
|---|---|---|
| Test the site builder | 5 | 457 |
| Redraw stale Shed Designer pictures | 9 | 292 (about 32 s each) |
| Build the site | 9 | 198 |
| Check the built artifact | 9 | 99 |

On every non-PR run the redraw step ran `make-renders.mjs --check`, found the
committed pictures stale, and so installed Playwright and Chromium
(`npm install` + `playwright install --with-deps`) before drawing. Nothing is
committed back, so the pictures stayed stale on `main` and the cost recurred
on every merge and every three-hourly deploy.

## Change

Ran `node ventures/shed-designer/make-renders.mjs` (39 targets stale, 1 m 54 s
in the sandbox) and committed the result: `manifest.json` (scene hashes) and
three changed gallery cards. `--check` now exits 0 and the step returns at its
first line. `RENDERS_STRICT=1 node --test renders.test.mjs`: 9 pass.
Budget: 1054 KB of 1100 KB.

## Before / after

Before: about 32 s per non-PR Pages job (292 s over 9 jobs). After: the
`--check` call only, about 1 s, as long as `main` stays fresh.

## Not changed / next

1. Staleness will return whenever a change touches the scene hash inputs
   (`model.mjs`, `render3d.mjs` shaders, `renders.mjs`, gallery data) without
   regenerating. `renders.test.mjs` only fails under `RENDERS_STRICT`; a cheap
   PR-time `--check` (no browser) in the shed-designer tests would catch it.
2. `Test the site builder` (457 s over 5 jobs) is still the largest step; see P062.
