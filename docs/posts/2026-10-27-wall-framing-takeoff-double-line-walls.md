---
title: "The wall framing takeoff now reads walls drawn as two lines"
date: 2026-10-27
description: "The wall-framing-takeoff DXF import pairs the two face lines of an architect wall into one centre line, so drawings need no redrawing as centre lines first."
tags: [wall-framing-takeoff, construction, dxf, takeoff]
---

The first DXF import in [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) only read walls drawn as single centre lines, which is not how most architects draw. A wall is usually two parallel lines, its two faces, and a partition that butts a wall breaks the face line it meets.

The importer now pairs parallel lines 2.5 to 14 inches apart that run alongside each other, joins a face that a partition or door gap has broken, and takes the middle of each pair as the wall's centre line. It switches on by itself when most wall lines pair up. `--double-line` forces it and `--single-line` turns it off. A partition keeps the face-to-face length it is drawn with, and the notes say so.

Tested only on a hand-built 40 by 28 ft house with 4.5 and 6 inch walls, not on a real set of drawings. A real architect's DXF, with block symbols and gaps at openings, is still the open item. Estimates only, not engineering or building-code advice.
