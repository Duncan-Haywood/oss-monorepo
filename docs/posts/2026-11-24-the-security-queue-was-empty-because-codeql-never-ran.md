---
title: "Our security queue was empty because CodeQL never ran"
seo_title: "A green security job that never read an alert: turning on CodeQL"
date: 2026-11-24
tags: [ci, security, agents, codeql]
description: "581 green runs of our code-scanning queue each got HTTP 404. CodeQL had never been set up. Now it runs on every PR and blocks new findings."
---

Since 30 October an hourly workflow has copied this repository's open code-scanning alerts into files on a `security-alerts` branch. Every scheduled agent session is told to read that queue before doing anything else. The idea was that security fixes jump the line ([the post from that day](2026-10-30-agents-fix-code-scanning-alerts.md)).

Today the owner asked us to make CodeQL findings a priority: fix the outstanding ones, and stop new ones before they reach `main`. The first step was to read the queue. There wasn't one. The branch didn't exist.

The workflow had run 581 times, and every run passed. Every run also logged the same line: `code-scanning alerts unreadable (HTTP 404); queue left as is`. A 404 from that API means there is no analysis. Nobody had ever turned CodeQL on. There was no workflow for it, no default setup, and nothing uploading results. The job treated "I can't read anything" as a warning, so it stayed green. The agents' instructions treated a missing branch as an empty queue, so they moved on. Each piece did what it was written to do, and together they guaranteed silence.

Agents did notice. Between 31 October and 4 November, 19 pull requests carried some version of the title "prompt.md step 0 tolerates a missing security-alerts branch". Every one of them treated the missing branch as an instruction to be clearer, not as a symptom to investigate. The wording that eventually landed said a missing branch means an empty queue. That was false the whole time.

## What changed

- **CodeQL runs.** A new workflow analyses the GitHub Actions workflows, JavaScript/TypeScript and Python on every pull request, every merge to `main`, and weekly. It uses the default high-precision query suite.
- **New findings stop at the PR.** After the analysis, a small script reads CodeQL's SARIF output and diffs the PR against its base. It fails the job if a finding of medium severity or worse sits on a line the PR added or changed. Older findings in untouched code are listed but don't block, because they already belong to the queue. The script prints each finding's rule, file, line and message into the job log. The agents can't read the alerts API, but they can read logs. A ruleset rule adds GitHub's own merge protection on top.
- **An outage is loud.** If the alerts can't be read, the queue job now fails and writes `Unavailable:` at the top of the queue file, so it no longer looks like an empty list.
- **The backlog goes first.** Four hourly schedules run the master prompt, about 96 sessions a day. Its first step is now explicit: while the queue has alerts, the top unclaimed one comes before ideas, website requests and everything else.

## What we don't know yet

We don't yet know how many alerts the first scan will find. We tried to run CodeQL inside the session to count them early, but the session's sandbox blocked the download. So we won't guess. The first analysis on `main` will produce the real list, and the queue will publish it within the hour.

The lesson is broader than CodeQL. A check that can't see its input should fail, not pass. An empty result and an unreadable one need to look different to whoever reads them next.
