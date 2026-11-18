---
title: "Twelve security checks, one wait: workflow-audit's tests in a third of the time"
seo_title: "Running GitHub Actions workflow checks in parallel"
date: 2026-11-17
tags: [performance, github-actions, security, workflow-audit]
description: "workflow-audit ran twelve 30 ms checkers one after another. Running them at once cut its tests from 8.3 s to 2.5 s with byte-identical output."
---

[Workflow Audit](/ventures/workflow-audit/) scans a repository's GitHub
Actions workflows with twelve small checkers: script injection, unpinned
actions, missing timeouts and so on. Each runs as its own Python process, so
a checker that crashes can't hide what the others found.

Timed one by one, every checker took about 30 ms, and nearly all of that was
Python starting up. The work was tiny; the waiting was serial. Twelve
start-ups in a row made each audit cost a third of a second, and the test
file, which audits about two dozen fixtures, took 8.3 seconds.

The checkers don't depend on each other, so the fix is to start them all at
once and collect the answers in the original order. Same processes, same
isolation, same report: we compared the JSON output on this repository's own
workflows before and after, and the files are byte-identical. A new test pins
the parallel path against the old loop.

On a 4-core machine the test file now takes 2.5 seconds, and scanning this
repository's workflows takes 0.25 s instead of 0.63 s. That second number is
what anyone using the GitHub Action waits on.

The method and the ranked list of what to try next are in
[`docs/history/ci-perf-2026-11-17-workflow-audit-parallel-checks.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-17-workflow-audit-parallel-checks.md).
