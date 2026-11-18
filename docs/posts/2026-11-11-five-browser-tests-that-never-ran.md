---
title: "Five browser tests that skipped without saying so"
seo_title: "Why our UI test tool skipped its browser tests in cloud sessions"
date: 2026-11-11
tags: [process, testing, agents]
description: "uitest's five real-browser tests skipped in every cloud session because ESM import ignores NODE_PATH. A require() fallback runs them: 30 of 30 pass."
---

`platform/uitest` is our open-source tool for agent-driven UI tests. Its suite has five tests that drive a real Chromium: a crawl that should find a broken page, scripted steps, and an agent goal run against a stand-in model server. In a cloud session those five tests reported **skipped**, while the 25 unit tests passed. Nothing failed, so nothing looked wrong.

A friction report from a quality run this morning pointed out the problem. Playwright *is* installed in these containers. It sits in a global directory on `NODE_PATH`, and `require('playwright')` finds it from anywhere. The tool loaded it with `await import('playwright')`, and Node's ESM resolver doesn't read `NODE_PATH`. The import failed, the loader threw "Playwright is not installed", and the test file turned that into a skip. Any agent changing uitest in a cloud session was testing the parts that need no browser.

## The fix

When the plain import fails and no `PLAYWRIGHT` path was given, the loader now tries `createRequire(import.meta.url)('playwright')`, which does honour `NODE_PATH`. The test helper that launches the CLI in a child process ran it with a cut-down environment, so it now passes `NODE_PATH` through as well. Without that, the five tests stopped skipping but failed with a setup error, which is at least a visible failure.

Measured in this session (`node --test browser.test.mjs uitest.test.mjs` in `platform/uitest`):

| | pass | fail | skipped |
|---|---|---|---|
| before | 25 | 0 | 5 |
| after | 30 | 0 | 0 |

CI was not affected. The uitest workflow installs Playwright itself and sets `PLAYWRIGHT`.

## A smaller one in the same PR

`platform/ci/wait_for.py` waits on a background job's log until a marker line appears. It waited for `DONE` by default. Runs that ended their command with `echo EXIT $?` had to remember `--marker EXIT`. Today one run guessed a `--pattern` flag that doesn't exist, and an earlier run waited out a 540-second timeout on a log ending in `EXIT 0`. With no `--marker`, it now accepts either a `DONE` line or an `EXIT <code>` line. An explicit `--marker` still waits for that marker only.

## What it says about skips

A skipped test reads as "not applicable here", even when the thing it needs is installed and the loader is simply looking in the wrong place. When a skip depends on the environment, the skip message should say what was looked for and where. uitest's message already did ("Playwright unavailable: …"), but in a passing suite nobody reads skip reasons. A report from one run that bothered to read it found this.
