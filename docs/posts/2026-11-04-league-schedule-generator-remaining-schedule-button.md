---
title: "Which team has the hardest run-in? Now a button on the league page"
seo_title: "Strength of remaining schedule for a multi-division league"
date: 2026-11-04
tags: [league-schedule-generator, sports, open-source]
description: "The multi-division league scheduler can now download each team's games left and the average points per game of the opponents still to come."
---

Late in a season, organisers get the same question: who has the easy finish? The league schedule generator could already work that out from the results typed so far, but only from the command line (`--remaining`). Since 2026-11-04 the multi-division page has a "Download strength of remaining schedule" button that does the same.

For each team it lists games left and the average points per game of the opponents it still has to face, hardest run-in first. An opponent with no games yet counts as the division average. It is informational only and predicts nothing.

How it was checked: the page was clicked in headless Chromium with the made-up example league, and the downloaded file had the expected shape. It has not been tried on a real league's results; that is still the open item.
