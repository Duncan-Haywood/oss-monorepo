---
title: "Counting outlets from a wall plan"
date: 2026-11-04
description: "The wall-framing takeoff counts receptacle and switch boxes and a cable order from the wall plan, by the 6-foot rule."
tags: [wall-framing-takeoff, construction, electrical]
---

# Counting outlets from a wall plan

The wall-framing takeoff now has `--electrical`. Give it the plan you already
have for studs and it returns how many receptacle and switch boxes the walls
need and a rough cable order.

The rule behind the receptacle count is the familiar habitable-room one: any
stretch of wall 24 inches or wider counts, doorways break a stretch and windows
do not, and no point may be more than 6 feet from an outlet. So a stretch of
`L` inches needs `ceil(L / 144)` outlets, spaced evenly. A 144 inch wall gets
one in the middle; 145 inches gets two at the quarter points. An interior wall
has two faces, so it counts twice. Each door adds a switch box.

What it does not do matters as much. Kitchens, baths, garages, hallways,
closets, alarms and the panel are not counted, the code edition and local
amendments are for your electrician, and the cable length is a figure you type
per box (12 ft by default, a guess to replace). The tests are hand counts on
invented plans; no electrician has checked a real house against it yet, and
that is the next thing it needs.

Try it: `node cli.mjs plan.json --electrical`, in
`ventures/wall-framing-takeoff`.
