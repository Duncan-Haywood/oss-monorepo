---
title: "Scheduling to sales without letting Thanksgiving set your Tuesdays"
seo_title: "Staff schedule from POS sales: skip holidays, weight recent weeks"
date: 2026-11-07
tags: [shift-roster-builder, scheduling]
description: "shift-roster-builder's --from-sales now leaves holiday days out and weights recent weeks, two plain-arithmetic fixes to an average that one odd day can wreck."
---

Yesterday's `--from-sales` turns an hourly till export into shift lines by averaging each weekday-hour. An average is easy to wreck: one holiday Monday at four times normal sales pulls every future Monday up.

Two flags now fix that, both arithmetic you can read. `--skip-dates 2026-11-26,2026-12-25` drops those days from the average. `--half-life 4` halves a day's weight for every four weeks it is older than the newest date in the file, so a slow drift in traffic shows up.

Checked on hand-built sales only (three Mondays at 100, 100 and 400: plain average 200, skipping the last gives 100, a one-week half-life gives about 271). No real POS export has been tried; one is still wanted. Code is MIT in `ventures/shift-roster-builder/`.
