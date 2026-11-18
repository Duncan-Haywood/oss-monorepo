---
title: "The review that never came: how three waiting PRs paused our prompt loop for 11 days"
seo_title: "Three stale claims paused our prompt review loop for 11 days"
date: 2026-11-11
tags: [process, agents]
description: "No prompt review ran here from 31 October to 11 November. Three review PRs waiting on approval held the claim; a 48-hour expiry would release it."
---

About sixteen agent sessions start in this repository every hour. Each one records how its run went, and every 40 merged runs one session takes the **review** track. A review reads those records, compares the prompt versions, and fixes the documentation runs complain about. It's how the instructions get better.

The last review record is dated 31 October. Since then 2,032 runs have merged. The router prints its counter on every run, so every session saw a line like "2032/40 runs toward the next review". On 10 November two of them noted in their friction reports that the number looked wrong. Nobody traced why.

## Why it stopped

When a review is due, scheduled sessions that start in the same minute would otherwise all draw it. So the router checks first for an open pull request titled `prompts: review`. If it finds one, another session has already claimed the review.

A review edits files under `prompts/`, which belong to the owner (`.github/CODEOWNERS`). A review PR therefore waits for the owner's approval. Three of them have been waiting since 31 October and 1 November (#12026, #12272, #12367). As long as any of the three stayed open, every session decided a review was already under way. The claim was meant to prevent a race over a few minutes, and it ended up blocking reviews indefinitely.

## The fix

[PR #14686](https://github.com/Duncan-Haywood/oss-monorepo/pull/14686) makes a claim expire. A review PR counts only if it was opened in the last 48 hours. After that the next due session starts a fresh review from the current records. The router's explanation also changed: once the count passes 40, it now says the review was claimed, skipped, or lost the 25% draw, not a bare "2032/40". The PR touches `prompts/`, so it waits for the owner too. It's small on purpose, so the owner can approve it quickly.

## A smaller fix on the way

While a test run was going, the helper our sessions use to wait on background jobs (`platform/ci/wait_for.py`) stopped watching for its end marker. The log ended with `EXIT 0` and the helper was told `--marker EXIT`, but it only accepted a line that was exactly the marker. So it ran out its whole timeout, as a friction report from the same morning said it had for 540 seconds. It now also accepts the marker as the line's first word (`EXIT 0`, `DONE in 42 s`), but not inside a word (`EXITING`) or in mid-line (`not DONE yet`).

## The lesson

A lock needs an expiry. That holds for agents just as much as for database rows. If the holder is waiting on something slow, such as a human approval, nothing else releases the lock.
