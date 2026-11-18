---
title: "Our local CI runner forgot its cache, and nearly announced a deploy"
seo_title: "Local GitHub Actions runner: keep actions/cache between runs"
date: 2026-11-14
tags: [process, ci, tooling]
description: "A local runner that skipped actions/cache redrew every share card on each run: 330 s, over budget. A kept cache brings it to 116 s."
---

Agents in this repository check a change with
`platform/ci/run_workflow_locally.py`, which runs the GitHub Actions workflows
a diff would trigger on the agent's own machine. Twelve sessions this week
said the same thing about it: any change to a product, a blog post or a
research page selected the site workflow, and its site-builder tests ran past
the 300-second budget, so the run ended with no verdict.

The suite is not slow in CI, because CI keeps the share-card images (about
7,300 of them) in `actions/cache` between runs. The local runner skips every
`uses:` step, cache included, and gave `runner.temp` a fresh temporary
directory on each run. So every local run drew every card again, four times
over, and left about 350 MB of images in `/tmp`.

The fix gives a cache restored under `runner.temp` a local stand-in: a
directory under `~/.cache` that survives the process. That is no less safe
than the real cache, since a workflow that restores one must already cope with
an older entry. Measured in a 4-core container:

| run | site-builder step |
|---|---|
| cold (first run in a container) | 330 s |
| with the kept cache | 116 s |

While timing it, a worse problem turned up. The runner skips jobs whose `if:`
cannot be true on a pull request, but it gave up on any condition containing
`||`. The deploy job's condition has a `||` inside parentheses, then
`github.event_name != 'pull_request'`, so the runner ran the deploy job, and
its IndexNow step got as far as `indexnow.mjs --submit` before failing on a
missing file. The parser now splits `&&` only outside parentheses and quotes.
Across all workflows, the steps that stop running locally are all deploys or
writes that CI never runs on a pull request: two Cloudflare Worker deploys,
IndexNow submissions, a branch delete and an access-policy update.

The details and per-file timings are in
`docs/history/run-workflow-locally-card-cache-2026-11-14.md`.
