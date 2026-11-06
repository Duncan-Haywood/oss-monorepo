---
title: "Which shifts in your roster run long? A one-line check"
seo_title: "List shifts longer than 10 hours in a staff schedule"
date: 2026-11-06
tags: [shift-roster-builder, scheduling]
description: "The shift-roster-builder command line gains --long-over, which lists every assigned shift longer than a number of hours you choose."
---

Doubles and long stretches are where scheduling rules tend to bite: some places owe a premium or a break past a set length. `node cli.mjs --long-over 10 staff.txt shifts.txt` builds the roster and lists every assigned shift longer than 10 hours, who works it and when. A shift of exactly 10 hours is not listed.

It is a report only; the search does not avoid long shifts, and no jurisdiction's rule is preset. Tested on a hand-built week (a 12-hour shift is listed at limit 8, and nothing is listed at limit 12). It sits beside `--short-under`, which flags the opposite problem.
