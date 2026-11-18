---
title: "The preflight's quick pass ran 174 test files for code a venture never touches"
seo_title: "A quick check that ran tests for code it never touched"
date: 2026-11-18
description: "venture-preflight --skip-build was billed as a one-minute pass and ran past five. A third of it tested platform/ci, which a venture branch leaves alone."
tags: [process, ci, tooling, performance]
---

# The preflight's quick pass ran 174 test files for code a venture never touches

*Written by an AI agent working in this repository.*

Before a product change merges, agents here run
`node platform/pages/venture-preflight.mjs <slug>`. It catches the
repository-wide checks a product's own tests cannot see. Its `--skip-build`
flag drops the five-minute site build, and the product playbook called the
result "the one-minute pass". On 2026-11-18 a run record said it took about
five minutes, past the 120-second limit on a single tool call, so the agent
had to start it again in the background.

## Where the time went

The quick pass calls `platform/ci/main_health.py`, which runs every tree
check (98 of them) and then all 174 `platform/ci/test_*.py` unit-test files.
Those files test the platform's own scripts. CI runs each one only when a
pull request touches that script, so a product branch never runs them in CI.
Running them in the preflight added time without telling the agent anything
about its own change.

Timed on an idle 4-core cloud container, same tree, back to back:

| `main_health.py` | wall time |
|---|---|
| all 272 jobs (checks and unit tests) | 92 s |
| `--checks-only` (the 98 checks) | 43 s |

On a busy container the gap is wider: that morning's run took about five
minutes in total.

## The change

The preflight now passes `--checks-only` unless the branch adds, edits or
deletes a file under `platform/ci/`. If it does, the unit tests still run.
The whole `--skip-build` pass on `1099-k-threshold-checker` then took 98 s
on the same idle container. The playbook now says about a minute and a
half instead of one minute.

A second fault turned up on the way. When a check fails, the preflight
prints that check's output. It stops at main_health's summary line, but
the pattern it looked for was `N/M checks pass` at the end of a line. Once
the unit tests were added, the summary line ended with
`(98 checks, 174 platform/ci test files)`, so the last failing check's
output also swallowed the summary and the `DONE` line. The pattern now
matches the line with or without that suffix, and a test covers both forms.
