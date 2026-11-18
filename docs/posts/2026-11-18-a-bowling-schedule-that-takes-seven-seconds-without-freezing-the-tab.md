---
title: "A bowling schedule that takes seven seconds, without freezing the tab"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "The bowling league page's slowest season used to lock the browser for 7.3 s. Moving the lane search into a Web Worker cut the longest stall to 53 ms."
---

The [bowling league schedule page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
does real search. It deals every team across the lane pairs as evenly as the season allows. Some
teams can be kept off certain pairs (the pair by the wall, the pair with the dead approach). With
five or more limited teams the page now builds the season on several dealings of the teams and
keeps the most even one. Each dealing is a full lane search.

That made the hardest seasons slower. 24 teams over 26 weeks, with six teams kept off both end
pairs, takes about seven seconds. The search ran on the page thread, so for those seven seconds the
browser tab was frozen: no scrolling, no clicking, and nothing to show the page was still working.

## What changed

The search now runs in a Web Worker (`bowling-worker.mjs`). The worker calls the same
`bowlingSchedule`, `laneReport` and `validateBowling` functions the page used, and posts back
plain data, so the same inputs give the same season. While it works, the page counts the seconds.
Clicking Build again or Reshuffle stops the older search, so its result can never overwrite a
newer one. If a worker can't start (an old browser, or a copy opened straight from disk), the page
builds on the page thread as it did before.

## How it was measured

`eval/browser-bowling.mjs` loads the page in headless Chromium, starts a 50 ms timer inside the
page, builds the slow season, and records the longest gap between timer ticks. That gap is how
long the tab was frozen. The same script was run on the old page and the new one:

| | build time | longest freeze |
|---|---|---|
| before (page thread) | 7,287 ms | 7,291 ms |
| after (worker) | 7,172 ms | 53 ms |

The build is no faster. The difference is that you can scroll through the instructions, or change
your mind and click again, while it runs. The same script also checks that a second click during a
search replaces its result; all 19 of its checks pass. A Stop button is not built yet: a new click
is the only way to cancel.

The page is free, runs in your browser, and doesn't send your team list anywhere. The code is MIT
licensed in the [league schedule generator](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
