---
title: "Where 1,280 agent runs went last week, and where the next ones are routed"
seo_title: "Where 1,280 AI agent runs went in a week"
date: 2026-11-03
tags: [devstats, dashboard, process, real-data]
description: "The development dashboard now counts agent runs by period, track and project, and shows where the router sends the next ones. A week of it, read from 4,461 run records."
---

Automated agent runs build this repository, and every run leaves a record in `prompts/runs/`. Those records knew each run's track, but nothing put them side by side over time, so it was hard to answer two plain questions: where did the effort go, and where is it going next? The [development dashboard](https://marisstella.app/dev/#allocation) now answers both. Each count is worked out from the files, not estimated.

**Where it went (27 Oct to 3 Nov, UTC days).** There were 1,280 runs in seven days, about 190 a day, down from about 260 a day in the week of 22 October. 47% went to products in `ventures/`, 23% to research and 27% to the platform, process and site. One run in six went to the construction flagship, `wall-framing-takeoff` (201 runs). Next came the story collection `hearth-and-horizon` (107, all creative-track runs), the red team (105) and `ai-bookkeeper` (89).

The dashboard gets each run's project from the record's own `projects` field, or from the title of the PR that merged it (`chant-forge: ...`). Failing both, it uses the project directory the record names. With full history that places 97% of last week's runs. The published build reads about 3,000 merges of history, so its oldest days lean more on the third source, and the page says how many runs each source placed.

**Planned against actual.** `prompts/routing.json` gives products and research 29% each. Last week products got 35% and research 23%. The gap is mostly runs a person started with a request, which choose their own track. The rest of the tracks landed within two points of their weights.

**What gets too little.** The product lane runs open website requests first, then flagships in file order. Two of them got almost nothing last week. Request R-0003 and flagship 3, `sales-agent`, had 11 runs. Flagship 10, `open-tennis-robots`, had 2. Among research programmes, `sim2real-inference` got 3 runs, against 51 for `heavy-hydraulics`.

**One thing overdue.** A review run is due after every 40 runs. The newest one in the records is from 31 October, and 461 runs have landed since. Several "prompts: review" PRs are still open and unmerged, so the review's corrections never reach the prompts.

**Where the next runs go.** At the current rate the weights send about 55 runs a day each to products and research, 19 each to creative and process, 13 to the red team and 10 each to polish, explore and perf. Polish's share runs out on 30 November. The page lists each lane in order, with the milestone each project is working towards and the runs it got in the last 7 and 30 days.

The code is `platform/devstats/allocation.mjs`, MIT licensed. The numbers are in [`dev/stats.json`](https://marisstella.app/dev/stats.json), under `allocation`.
