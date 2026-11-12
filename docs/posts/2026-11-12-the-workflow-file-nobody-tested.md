---
title: "The workflow file nobody tested: a lost-state race in a self-hosted metric watch"
seo_title: "Testing a GitHub Actions workflow's shell steps without GitHub"
date: 2026-11-12
tags: [changepoint-detector, ventures]
description: "Replaying a scheduled GitHub Actions workflow over 20 simulated days found a push race that would have re-sent the same alert. The fix is four lines."
---

The [Changepoint Detector](https://marisstella.app/changepoint-detector/) can watch a metric for you from your own GitHub repository. One script writes a folder: the detector, a small `watch.mjs`, and a scheduled workflow. Once a day the workflow checks your CSV, tells you once when the level has really moved (a Slack or Discord post, or a red run that GitHub emails you about), and commits a small state file so tomorrow's run knows what it already said.

`watch.mjs` had a dozen tests. The workflow file around it had none. That file is what a stranger actually runs, so we tested it the way a runner runs it.

## Running the YAML without GitHub

A new helper, `deploy/run-workflow.mjs`, reads the workflow's `run:` blocks and runs each one the way a GitHub-hosted runner would. Each run starts from a fresh shallow clone, uses the same bash flags (`-eo pipefail`), fills `vars` and `secrets` in (empty when unset), writes the step summary to a file, and honours `if: always()`. A local bare repository stands in for GitHub. A second clone plays the deployer's data job and commits one row a day.

The test series: 60 days of orders around 100 a day, then a step up to 120 on day 70, then 20 daily runs.

- With no webhook, one run goes red, on day 72. The change is dated day 68, which is inside the five-point tolerance, after five points on its far side. That red run still commits its state, so nothing repeats.
- With a webhook that returns a 500 the first time, that run is red and saves nothing. The next day's run sends the same dated change again and gets through. That's two POSTs in total.
- With `METRIC_CSV` unset, the run stops with the instruction and commits nothing.

## The bug

What if the data job pushes tomorrow's row while today's check is still running? The save step ran a plain `git push`. The remote refused it, the run went red and the state file was lost. The next morning, the same change would have been reported again. It's the classic failure of a watch, and it would hit the users who set things up best, the ones whose CSV is fed automatically.

The fix replays the bot's single commit on top (`git pull --rebase`) and pushes again, up to four times. Only the bot writes the state file, so the rebase has nothing to conflict with. The test fails against the old file and passes against the new one.

## What this isn't

It's an emulation, not GitHub. The checkout and setup-node actions are replaced by `git clone` and the local Node. GitHub's habit of pausing scheduled workflows in quiet repositories after 60 days isn't exercised, and neither is the token's push permission. A real deployer's repository is still the open check. But the most common way for a daily watch to fail, which is two writers on one branch, is now covered by a test.

Statistical analysis of data you supply, not advice.
