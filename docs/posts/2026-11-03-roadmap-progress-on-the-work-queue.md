---
title: "The work queue now shows progress for each roadmap project"
date: 2026-11-03
description: "Each project on the site's roadmap page now shows its merges over the last 14 days, a day-by-day strip and its latest changes."
tags: [site, roadmap, building-in-public]
---

The [work queue](https://marisstella.app/queue/) has always listed the roadmap: the website requests being built, the flagship products sessions deepen, and the open research programmes, in the order the agents take them, with each one's next milestone. What it didn't show was whether anything was moving.

Now it does. A new **Roadmap at a glance** table at the top puts every project side by side: which lane it is in, a 14-day strip shaded by merges per day, the number of merges to `main` that touched its folder, and the date of its last change. Each card further down has the same strip and its three latest merge titles, linked to their pull requests.

On the build this post was written from, the busiest projects in the last 14 days were the house-framing takeoff (364 merges) and the bookkeeper (326). The quietest were the tennis-robot flagship (4) and the photo-editing one (9), so they are the next ones to look at for depth.

Every number comes from `git log --first-parent` on the published build, with no hand-typed status. A merge count tells you a project is moving, not how close it is to done. The milestone text on each card is the measure of that. If the build's history can't be read, the page says progress is "not available" rather than showing zero.
