---
title: "The cheap check ran last, so agents never saw it fail"
seo_title: "Ordering local CI jobs so the cheap check gets a verdict"
date: 2026-11-12
description: "A local CI runner ran a 300 s test suite before a 0.1 s front-matter check and ran out of time in between. Fix: cheapest job first, and honour if: on a PR."
tags: [process, agents, ci, developer-tools]
---

Agents in this repository verify their own pull requests with `python3 platform/ci/run_workflow_locally.py --for-changes`. It reads the diff, picks the GitHub Actions workflows the change would start, and runs their read-only steps on the session's machine, with a time budget per workflow so one slow workflow cannot eat the whole sweep.

On 2026-11-12 five run records reported the same thing in their `doc_friction` field. A research or blog post diff selects the site workflow, `portfolio-pages.yml`. The check that such a diff can actually fail, `check_post_frontmatter.py` (a description over 160 characters, a misspelled tag), takes a tenth of a second. It came back UNRUN every time, and the agents found it in the YAML and ran it by hand.

## Why the cheap check never ran

The runner executed jobs in file order. In `portfolio-pages.yml` the `test` job, whose site-builder suite runs for 300 seconds or more, comes before the `build` job, whose second step is the front-matter check. The budget ran out inside the suite, and every step after it, the cheap check included, was marked as not reached.

In CI the two jobs run side by side: neither `needs:` the other. So the order was an accident of where they sit in the file, not something the workflow asks for.

## Fix one: cheapest declared job first

The runner now orders jobs by their `needs:` graph and, among jobs that are ready, picks the one with the lowest `timeout-minutes` first. That number is the workflow author's own cap on the job, the best cost estimate the file holds. Ties keep file order, and a `needs:` cycle falls back to file order. Here that puts `build` (20 minutes) ahead of `test` (30 minutes), and the front-matter check now gets its verdict 0.1 seconds into the run.

## Fix two: a step CI skips on a pull request is skipped here

Checking the new order end to end turned up an older fault. With `build` first, the run stalled on "Add the development dashboard", a step that polls for ten minutes for a file written by a background step. The background step had been skipped, so the file never came.

Both steps carry `if: github.event_name != 'pull_request'`. CI never runs them on a pull request, and a local sweep stands in for a pull request's CI, but the runner ignored `if:` entirely. It now drops a step or job whose `if:` cannot hold on a pull request and lists it with the other skipped steps. The judgement is deliberately narrow: only `&&` chains, and only their `github.event_name` terms. A condition with `||`, step outputs or `needs.` still runs as before, so nothing that might matter is quietly dropped. In `portfolio-pages.yml` that removes six steps and one job that only ever run after a merge or on a schedule.

## Checked how

Five new unit tests cover the job order, `needs:` beating a lower timeout, the cycle fallback, the `if:` cases, and this repository's own workflow keeping the front-matter check ahead of the suite. All 140 tests in the runner's suite pass. The full portfolio-pages run on this branch is in the pull request's run record.

The measure for a later run is the count of `doc_friction` entries saying the front-matter check (or any cheap check) went UNRUN behind the site-builder suite. The baseline is five on 2026-11-12 before this change.
