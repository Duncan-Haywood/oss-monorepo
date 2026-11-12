---
title: "A metric watch that lives in a browser tab"
seo_title: "Get told once when a metric changes, from a browser tab"
date: 2026-11-12
tags: [changepoint-detector, ventures]
description: "The changepoint watch needed a GitHub repo and a daily job. Now it also runs in the page, remembers what it told you, and is one call for an agent."
---

This morning the [changepoint detector](https://marisstella.app/changepoint-detector/) learned to watch a series. Most people with a metric want that, not a one-off answer: tell me once when sign-ups, orders or latency have moved for good, and leave me alone on odd days. The watch refits the series after each new row and reports a change only when five points sit on its far side. It also remembers what it has already reported, so the same step never comes back as a second alert. Four rounds of tests chose the defaults, each rule written down before its run. On 31 real labelled series it sent 18 alerts per 1,000 checks, and 41% of them landed on a change a human annotator had marked.

It shipped as a [self-hosted daily job](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html): a script makes a small repository, GitHub Actions runs it every morning, and it posts to Slack or Discord. That's the right shape for a team. It's too much for one person who checks a dashboard twice a week.

## The same watch, no repository

The page now has a card called **Keep watching a series**. You paste the rows, or a link to a Google Sheet published as CSV, and press **Check for new changes**. The first check counts the changes already in the history as the baseline and doesn't alert on them. Come back next week with more rows and it tells you about anything new, once.

The memory, meaning the list of changes already reported, is the part a page usually loses. Here it lives in the browser's local storage under the watch's name. Nothing is uploaded. The trade-off is plain: clear your site data and the watch forgets. And nothing messages you, so you have to come back. Messages are what the daily job is for, and the card links to it.

There's one small honesty point about the link. This is the first time the page fetches anything, so the test that guarded "nothing is sent anywhere" had to change. It now allows exactly one call: a GET of the link you typed, without cookies. It still sends none of your data, and the test fails if any other network call appears.

## One function, three callers

To get there, the watch's logic moved out of the command-line script into a module with no file, network or process access. The page imports it, the CLI re-exports it, and the repository's agent tool picks it up automatically, because that tool exposes what a page imports and refuses any module that can reach the network. An agent minding a metric for someone now makes one call, `watchCheck`, with the CSV and the state from its last call. It gets back the alerts and the new state to keep.

## What we checked, and what we didn't

A unit test feeds a series one row at a time for 80 checks and sends the state through JSON each time, as the page stores it. The new step was reported exactly once, between 5 and 15 rows after it happened. A headless-browser run covers the rest: the baseline survives a reload, a second step is reported once and then not again, and "Forget" starts over. A link the page can't read says so. A link that answers like a published sheet loads into the data box, though Playwright answered that one, not a real Google Sheet. The detection numbers didn't move, because it's the same engine with the same defaults.

What we don't know yet is whether anyone will use it. The page counts `watch_check` presses in the visitor's own browser, so the count stays on their device and doesn't come back to us.
