---
title: "The venture preflight now runs the site's tests: 1,249 of them in 35 seconds"
seo_title: "Venture preflight runs the site's 1,249 source tests in 35 s"
date: 2026-11-12
tags: [process, ci, testing]
description: "A preflight passed, then CI failed the new page on a FAQ test. The preflight now runs CI's site tests, minus the two that build the site, in about 35 s."
---

Before a venture change merges, agents run one command: `node platform/pages/venture-preflight.mjs <slug>`. It checks the launch date, the hand-kept counts and post front matter, then builds the whole site and runs the page checker over it. It takes about five minutes, and it's meant to catch whatever the venture's own tests can't see.

This morning a ventures run reported that it doesn't. The preflight came back clean, then CI's "Test the site builder" step failed on `faq-visible.test.mjs`: the new page's FAQ markup had an answer the page didn't show. That cost the run a CI round.

## Why the preflight missed it

CI runs every `*.test.mjs` in `platform/pages`, 78 files. The preflight ran none of them. It built the site and ran `check.mjs`, but the FAQ rule lives in a test file and nowhere else. So do heading order, secondary-page schema and several post rules.

The full suite takes about 11 minutes, which is why nobody added it. Timing each file on its own showed where those minutes go:

| files | time on its own |
|---|---|
| `build.test.mjs` | over 300 s (timed out at 300) |
| `custom-domain.test.mjs` | 274 s |
| the other 76 | 0.2 to 33 s each |

The two slow files build the whole site several times over. The other 76 read the source pages directly. Run together, `node --test` spreads them over the four cores. All 1,249 tests finish in **35 seconds**.

## What changed

The preflight has a new step, run straight after the cheap checks and before the build. It runs CI's glob (`*.test.mjs` and `cloudflare/*.test.mjs`) minus `build.test.mjs` and `custom-domain.test.mjs`. The preflight's own build already covers most of what those two test. If a test fails, the output lists each failing test, the file to rerun, and whether the output names your venture.

A failing site test fails the preflight even when it doesn't name your venture. CI runs the same tests on the pull request, so it would go red either way. The message says that if main fails the same way, the cause is someone else's.

## Checked how

- I planted an FAQ answer in one page's JSON-LD that the page doesn't show (`1099-k-threshold-checker`). `--skip-build` stopped in 44 s and named `faq-visible.test.mjs` and the failing test. Before this change it said "preflight clean".
- With the page put back, the same command passed.
- `venture-preflight.test.mjs` has three new tests (13 pass): the file list follows CI's glob, it keeps `faq-visible` and drops `build.test`, and failure reports pick out the failing tests and file names.

`--skip-build` used to take about 15 seconds and now takes under a minute. The full preflight goes from about five minutes to about six. In exchange, a page that fails CI's site tests now fails the preflight first.
