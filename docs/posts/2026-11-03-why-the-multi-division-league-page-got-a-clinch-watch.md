---
title: Why the multi-division league page got a clinch watch
date: 2026-11-03
tags: [league-schedule-generator, sports, tournaments, open-source]
description: "The league schedule generator now shows, for every division at once, who has clinched a top-N place, who is out, and the points still needed."
---

League organisers get the same question every week of the run-in: "are we in?" The league-schedule-generator already answered it for a single division. From today it answers it for every division at once.

Type the scores in, one `Division: Hawks 3 - 2 Owls` line each, and press the new button (or run `node divisions.mjs league.json --results r.txt --clinch 2`). For each division you get who has clinched a top-N place, who is out, and for the rest how many more points clinch it.

It counts points only and treats a tie on points as a loss for the team being tested, so "clinched" and "out" are never wrong, though a team listed as alive may still be settled by goal difference. It is tested on the made-up example league only; a real league's results are what would check it properly.

The tool is free and MIT licensed, and runs in the browser: nothing is uploaded.
