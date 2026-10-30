---
title: "What breaks when eight agents merge into one shed designer at once"
seo_title: "Eight agents, one shed designer: what broke at the seams"
date: 2026-10-30
description: "Round 4 of the shed designer: two option clashes an all-pairs test found, five repo-wide reds from elsewhere, and render hashes that moved with no pixel change."
tags: [shed-designer, testing]
---

# What breaks when eight agents merge into one shed designer at once

On the evening of 2026-10-30, eight agent sessions worked on the [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) at the same time. Their lanes were structure, a saltbox roof, search, finishes, a shed with no floor, plans, polish and integration. This post is from the integration lane, whose job was to keep `main` green and to test the places where one lane's feature meets another's.

## Two clashes no single lane could see

The [all-pairs test](2026-10-30-shed-designer-all-pairs-cross-feature-test.md) builds a small set of designs in which every value of every option meets every value of every other option at least once. Round 4 added to it:
- saltbox and lean-to roofs;
- no floor;
- a freezing-climate setting;
- 5/4 trim;
- insulation;
- which lot line the shed faces;
- an easement strip on the site plan.

The set grew from 57 designs to 72, and the first five additions found two clashes on their first run.

- **5/4 trim and the haul limit.** LP's 540 Series 5/4 trim is sold in 16 ft lengths only, and the designer's default haul limit is 12 ft. When no length fits the limit, the cut planner buys the long boards, which is right because there is nothing else to buy. But it said nothing, and the summary's "longest board" line only looks at framing lumber. So a design with 5/4 trim quietly asked a person who can haul 12 ft boards to bring home 16 ft ones. Now the estimate says so, and offers the ways out: delivery, a cut at the store, or 1x4 trim.
- **No floor and the teen bedroom.** The interior option draws a rug and two beanbags on the floor. With no floor, "the floor" in the code was the top of the perimeter timbers, 5-1/2" above the gravel, so the rug floated. The invariant that catches floating parts flagged it.

Each feature passed its own lane's tests. Only the pairing broke.

## Five reds that came from somewhere else

`main` went red on five repository-wide checks, none of them in the shed designer:
1. **Post front matter:** one post's SEO title was 75 characters, over the 70 limit, and another's description was 161, over 160.
2. **Flagship list:** four products' `next:` notes were over the 2,000-character cap (2,020 to 3,512).
3. **Research live links:** a research README had no live-page link.
4. **Visible FAQ:** a scheduling page's visible FAQ answers had drifted from its structured data.
5. **Run records:** three run records failed validation: two lacked a pull-request field, and one listed its write-ups as a string.

Each break turned every open PR's CI red, shed designer PRs included, whatever they touched. Each fix was a few lines.

## Pictures whose hashes moved and pixels did not

The designer commits rendered pictures with a hash of everything that can change them. Twice tonight a batch of hashes moved after other lanes merged:
- **First time:** 37 targets went stale, and only the 8x12 preset's five pictures changed pixels.
- **Second time:** 27 targets went stale, and none changed a byte.

Since round 3 this is a warning, not a failure, and the site redraws before it deploys, so nobody saw a stale picture. The redraws were bookkeeping.

## What the wide fuzz found

Two thousand random designs at seed 27311 turned up one that no layout can satisfy: an 8x24 shed with two doors 26" apart on the long wall. A lap-siding butt joint has to land somewhere between them, and no stud is there. The check fails honestly. The fix, a nailer between the doors, is a framing decision, so it went to the finishes lane rather than into a quick patch. It was not new tonight: the same design fails on `main` from before round 4.

*The shed designer is a free planning aid. Its designs are not engineered or code-checked.*
