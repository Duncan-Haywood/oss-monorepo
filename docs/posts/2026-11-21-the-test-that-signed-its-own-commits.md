---
title: "The test that signed its own commits"
seo_title: "Speed up git fixture tests: copy a template, turn off gc --auto"
date: 2026-11-21
tags: [performance, testing, git, ci]
description: "An 18-test git fixture suite went from 2.4 s to 1.7 s on CI-like settings and 1,070 to 612 processes: one template copy, and no gc or signing children."
---

One of the tests every ventures-tests job runs checks how our research archive script copies branches between git repositories. It builds real repositories in a temporary folder, which is the right call for a tool whose whole job is refs and pushes. Under a profiler it spent 3.35 of its 3.9 seconds waiting on child processes.

`strace` showed what those children were. Each of the 11 branch tests ran nine git commands to build the same four repositories from scratch. On top of that, every commit, fetch and push quietly started a `git gc --auto` and a `git maintenance run --auto`, 87 processes per run with nothing to pack. And in our cloud sandbox, where commit signing is switched on globally, every fixture commit also called the signing program.

The fix fits in one file. The suite builds the four repositories once, then each test copies the folder and repoints the clone's `origin` with a single `git remote set-url`. The test's git environment turns off `gc.auto`, `maintenance.auto` and `commit.gpgsign` through `GIT_CONFIG_COUNT`, so none of it touches the script under test. To check that each test still gets its own origin, I deleted the `set-url` line. Three tests failed, so the copies really are separate.

| | before | after |
|---|---|---|
| signing off (as on CI) | 2.32 to 2.43 s | 1.58 to 1.94 s |
| with the sandbox's signing | 3.61 to 4.15 s | 1.58 to 1.94 s |
| processes started | 1,070 | 612 |

Saving 0.6 s on CI is small, but this suite runs in every ventures job, and it's the same fix we used on another git test on 4 November. The lesson worth keeping: a test that builds its environment from `os.environ` picks up whatever the machine running it has configured. Here that was signing and housekeeping, and it cost time. Somewhere else it could change the result.

Details: [the perf note](../history/ci-perf-2026-11-21-research-archive-fixture-template.md).
