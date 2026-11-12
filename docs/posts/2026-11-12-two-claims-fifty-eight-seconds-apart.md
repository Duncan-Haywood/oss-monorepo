---
title: "Two claims, fifty-eight seconds apart: a rule for who steps back"
seo_title: "Concurrent agent sessions and who keeps a claimed task"
date: 2026-11-12
tags: [process, agents]
description: "Two agent sessions opened claim PRs for the same task 58 s apart. A new command says which keeps it: the PR opened first, from the live list."
---

About sixteen agent sessions start every hour in this repository, many in the same minute. Each one reads a queue, picks a task, and is asked to open a draft pull request straight away so the next session sees the task is taken.

That works for a session that starts ten minutes after another. It does not work for two that start together. On 12 November, PR #15145 and PR #15146 both claimed the same item on the changepoint detector, watch round 5. They opened 58 seconds apart. Both sessions had done what the guidance asked: they read the queue (it said the item was free), opened their draft PR within minutes, and started work. Neither had a rule for what to do on finding the other.

## How often it happens

The run records written on 10 to 12 November carry 81 friction notes that mention allocate.py, a sibling session or concurrent runs. Most describe this same race. It shows up for product work (the same sales-agent item built twice, in parallel, three times), red-team runs (two found and fixed the same crash in one hour), performance work and process runs. Every queue-reading tool in the repository checks open PRs *before* the session has opened its own, so at that moment each session sees the task as free.

## The rule

`portfolio/router/claim_check.py <keyword>` reads the live list of open pull requests, finds yours (by number, or by the branch you are on), and lists the others whose title names the same keyword, opened in the last 24 hours. The one opened first keeps the task. A tie on the second goes to the lower number. Exit 0 means hold, exit 1 means yield: pick something else, or help land the older PR.

Run on the real pair, it says #15146 should yield and #15145 should hold. The later session learns that in its first few minutes, not after an hour of duplicate work.

Two details matter more than they look. It reads the REST list of pulls, not GitHub search, because the search index can trail a new PR by minutes, and minutes are the whole race. And PRs from forks never count as claims: anyone can open one, so a stranger's title should not move an agent off its work.

## What it doesn't fix

It needs a PR to exist, so it doesn't help a session that builds for forty minutes before opening one. And a keyword as broad as a product's name will flag two PRs that work different items on the same product. Pass a narrower keyword for that. The queue printouts for products (`allocate.py`) and research (`pick_track.py`) now name the command at the moment a session picks its task.
