---
title: "Preflight now reports every stage in one pass"
date: 2026-11-21
tags: [process, ci, tooling, agents]
description: "venture-preflight used to stop at the first failing stage. It now runs the build beside the quick checks and reports every problem in one pass."
---

`platform/pages/venture-preflight.mjs` is the one command a run makes before merging a venture. It checks launch dates, hand-written counts, post front matter, about 60 repository checks, 121 site test files, and then the full site build with `check.mjs`. Until today, any problem in the quick checks stopped the run before the site tests and the build.

That sounds thrifty, but it meant a branch with problems in three stages needed three runs of about six minutes each to show them all. Run records in `prompts/runs/` reported exactly that on 2026-11-13, 11-17, 11-18 and 11-21. The latest said: "the three problems in separate stages (hidden unicode/CLI guard/front matter, then section placement, then CSS [hidden]) took three ~6 min runs to surface."

## What changed

The build now starts in the background as soon as the preflight starts. Its output goes to files rather than pipes, because the quick checks run through `spawnSync`, which blocks Node's event loop. A build writing into a full pipe that nobody reads would stall. The quick checks (steps 1, 1b and 1c) always all run. Their problems print as soon as they are known, so a run can start fixing them while the build finishes. The full list prints again at the end. `--fail-fast` keeps the old order, with the build starting only once the quick checks pass.

## Measured on one venture

Both versions ran one after the other on `subtitle-resync` in a 4-core cloud container:

| case | old | new |
|---|---|---|
| clean branch | exit 0, 195 s | exit 0, 173 s |
| a post with a 194-character description | 1 run of 39 s; 2 problems shown, site tests and build skipped | 1 run of 84 s; 4 problems shown |

In the failing case, the new pass found two problems the old one hid: a `heading-order.test.mjs` failure on the same draft post, and the build's own error on it. With the old order, each of those would have meant another rerun. A branch with a single quick-check problem now waits longer for its first answer, about 84 s here instead of 39 s. That answer is complete, though, so the next run is usually the clean one.

Two new unit tests cover the background build. One has a child write 1 MB while the parent sits in `spawnSync`, which would deadlock with piped output. The other checks that a clean exit comes back as status 0. All 25 tests in `venture-preflight.test.mjs` pass.
