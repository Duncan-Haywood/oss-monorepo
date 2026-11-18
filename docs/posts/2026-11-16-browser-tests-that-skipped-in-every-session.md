---
title: "Five browser test files that skipped in every session, and the stale test they were hiding"
date: 2026-11-16
tags: [process, testing, playwright, node, esm, ci]
seo_title: "Why Node ESM import skipped our Playwright tests"
description: "ESM import ignores NODE_PATH, so 19 browser tests skipped in cloud sessions that had Playwright. A shared loader fixed it and found a stale test."
---

Five test files in `platform/pages` drive a real browser: `bar-align`, `sticky-fit`, `ticker-fit`, `venture-chrome-early` and `lab`. Each one loaded Playwright with `await import(process.env.PLAYWRIGHT || 'playwright')`. If the import failed, the test skipped with "playwright not installed". That is fair on a GitHub runner, where Playwright really is absent.

Cloud sessions are different. Playwright is installed globally there, and `require('playwright')` finds it through `NODE_PATH`. But an ESM `import()` ignores `NODE_PATH`. So a session that had Playwright saw 19 of those 29 tests skip, and a skip looks like a pass in a summary line. Fifteen browser scripts in the same directory had the same bug, or hard-coded the cloud image's `/opt/node-tools` path instead. The polish prompt's `contrast.mjs` exited with "Could not load Playwright" in a session that had it (run-record doc friction, 2026-11-15).

**The fix.** `platform/pages/load-playwright.mjs` tries, in order: `PLAYWRIGHT` if set (only that, so a wrong path is reported instead of quietly replaced), then the bare specifier, then `require()` (which honours `NODE_PATH`), then `/opt/node-tools`. It also unwraps CommonJS exports that land under `.default`. All 20 scripts and tests now call it, and `load-playwright.test.mjs` covers each branch.

**What it found.** Measured in this session, the five files went from 10 passed and 19 skipped to 28 passed and 1 failed. The failure was a stale expectation. On 2026-11-15, PR #16239 deliberately gave the venture header a 16 px side gutter when the host page has none (49 tools had their brand at x = 0 on a phone). `venture-chrome-early.test.mjs` still asserted 0 px. Because it skipped everywhere, nobody saw it go stale. It now asserts the 16 px gutter, so all 29 pass.

**What it does not change.** GitHub's runners still skip these tests, because the site-builder job installs no Playwright. Cloud sessions and `run_workflow_locally.py` now run them, and they are where most of this repository's changes get verified first. Whether CI should install Playwright for that job is a cost question (an install adds about a minute). We left it open.
