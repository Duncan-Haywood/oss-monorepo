---
title: "215 story pages lose the tail of their title in search results. Now none do"
seo_title: "215 story page titles now fit a search result"
date: 2026-11-23
tags: [polish, seo, stories, saints-by-candlelight, hearth-and-horizon]
description: "Every Saints by Candlelight episode page and most Hearth & Horizon story pages had titles over 70 characters. Each title now keeps the longest suffix that fits."
---

Search results cut a page title at roughly 60 to 70 characters. The
[title checker](../../platform/ci/check_title_meta.py) flags anything over 70,
and on 2026-11-23 the two biggest offenders outside the e-invoice guides were
the story sites. Each one builds every page title from a single template:

- [Saints by Candlelight](../../ventures/saints-by-candlelight/): 169 of 170
  pages were too long. Each one was the episode title plus
  `| Saints by Candlelight, a bedtime saints podcast`. That suffix is 50
  characters on its own, so a search result showed the episode name and then
  part of the show's name, ending in an ellipsis.
- [Hearth & Horizon](../../ventures/hearth-and-horizon/): 46 of 544 pages
  were too long. Each was the story title plus
  `: a Catholic bedtime story (text and audio)`.

## What changed

Both generators now try their suffixes from longest to shortest and keep the
first one that fits within 70 characters:

| Story title | Title now |
|---|---|
| Jonah (short) | Jonah \| Saints by Candlelight, a bedtime saints podcast |
| Kevin and the Blackbird | Kevin and the Blackbird \| Saints by Candlelight, bedtime podcast |
| Paul and the Governor Who Said Not Tonight | … \| Saints by Candlelight |
| Priscilla and Aquila and the Preacher from Alexandria | the story title alone |

Short titles keep the descriptive words people search for. Long titles keep
the show's name, or failing that their own name, instead of a cut-off phrase.
The two index pages were shortened to 70 characters or fewer by hand. The
Hearth & Horizon index still says "AI-written", because the AI disclosure is
not something to trade for length.

The checker also counted `&quot;` as six characters. It now counts what a
reader sees, which removed 18 false positives across the repository.

## Numbers

| | before | after |
|---|---|---|
| Saints by Candlelight titles over 70 | 169 / 170 | 0 |
| Hearth & Horizon titles over 70 | 46 / 544 | 0 |
| All venture pages (`check_title_meta.py`) | 1,492 | 1,259 |

A test in each venture asserts that every generated title fits, so the next
story added can't bring the problem back. We have no ranking or click data
for these pages. This is a fix to what the result shows, not a measured
change in traffic.

The largest remaining group is the 100 hand-written country guides in
E-invoice Preflight. Their titles are long before the brand suffix is added,
so each one needs its own edit.
