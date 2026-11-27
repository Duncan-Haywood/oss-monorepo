---
title: "A cheaper map for the roster search: two more shifts filled"
seo_title: "Filling more open shifts in a big staff schedule"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "When the pricier pay LP no longer fits the time budget, the open-hours LP now steers the scheduler. It filled one or two more shifts on 2 of 10 test weeks."
---

> **Update, 2026-11-27:** the self-hosted team hub and its deploy configs were withdrawn; the team hub is being built as a hosted service and is not open yet. The roster builder itself still runs free in your browser.

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to [steer its day-by-day search with a linear program](2026-11-14-shift-roster-let-the-lower-bound-steer.md). The linear program (LP) is a relaxed version of the whole week's schedule. Its answer says, roughly, who should work which shift. Pulling the search toward that answer found rosters that no small change could reach. On some weeks that meant cheaper pay, and on others it meant fewer shifts left uncovered.

There was a catch. The LP doing the steering is the one that also prices pay, and on a 60-person week it takes about four seconds. The scheduler only runs it when that much of the 20-second budget is left. On many big weeks there isn't that much left, so the steering never ran.

## What changed

The scheduler already solves a cheaper LP on those weeks: about one second, counting only open hours. Its main job is to prove how many hours can't be covered. Its answer also says who could cover what. Now, when the pay LP is skipped, that cheaper answer steers the search instead. Everything else stays as it was. A roster is kept only if it scores better, and the pass still has its own two seconds.

## What it did

Ten generated 60-person weeks, run once each on one cloud machine (`eval/guide-open.out.txt` in the venture):

- On the two weeks where only the cheap LP ran, the new schedule left **2 fewer open hours** (210 to 208) and **1 fewer** (215 to 214). Pay went up by about $27 and $7, because those hours are now staffed and paid.
- On two more weeks the pricier LP had steered before but this time missed its time gate. There the cheap LP's steering did better than no steering, but not as well as the pay LP's.
- The other six weeks came out the same, and no week took longer.

These weeks are deliberately short-staffed, so most open hours can't be avoided. The cheap LP proves 205 is the least for the first one, so 208 is close.

## Why it matters to a manager

An open shift means someone works short-handed or a manager covers it. For a business with 60 staff, one or two more covered shifts a week, from the same people and availability, is time a manager doesn't spend phoning around.

Next is getting the pay LP itself to fit the budget more often, by starting it from the cheap LP's answer instead of from scratch.

The tool is free and open source, and runs in your browser or on your own server.
