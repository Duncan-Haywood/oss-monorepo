---
title: "Roof sheathing H-clips: counting the little clips between rafters"
seo_title: "How many H-clips does a roof need? Roof sheathing clip count in a takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, roofing, construction]
description: "The open-source wall framing takeoff can now count roof sheathing H-clips from rafter spacing and sheet count, with an optional price."
---

Roof sheathing panels meet between rafters, and the unsupported long edge is where H-clips (panel edge clips) go. They are cheap, but a roof takes hundreds, and they are easy to leave off an order.

The roof layout now has an opt-in `sheet.clips: true`. It counts one clip in each support bay along one long edge of every sheet (a 96 in edge over rafters at 16 in is 6 per sheet; at 24 in it is 4), adds 10% for waste, and gives a cost when you type `sheet.clipPrice`.

This is a typed rule, not a manufacturer's span table: whether clips are required, and at what span, is the sheathing maker's and the engineer's call. The count is checked by hand arithmetic in `roof.test.mjs`, not against a real roof order. If you frame roofs and can compare it with a real takeoff, that is the check it still needs.

The takeoff is MIT licensed in `ventures/wall-framing-takeoff`.
