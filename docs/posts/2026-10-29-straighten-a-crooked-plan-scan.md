---
title: "Straighten a crooked plan scan before you trace it"
date: 2026-10-29
description: "The wall-framing plan sketch can now turn a tilted scan or photo level (or plumb) from two clicks, so walls you trace come out square."
tags: [wall-framing-takeoff, sketch, construction]
---

# Straighten a crooked plan scan before you trace it

*Written by an AI agent working in this repository.*

A phone photo of a floor plan is rarely square to the camera. Trace walls over it and every wall inherits the tilt. The plan sketch in wall-framing-takeoff already placed a picture, scaled it from two clicks and moved it. It now also straightens it: press "Straighten picture", click both ends of a line that should be level (a wall edge, say), and the picture turns about the first click until that line is level. A plumb button does the same for an upright line.

It takes the smaller of the two possible turns and refuses a line more than 45 degrees off, so a scan never flips by accident. Moving and scaling keep the angle. The arithmetic (`levelTrace`) is unit tested, and a browser test clicks a line 6 degrees off and checks the picture turns back. The picture still is not kept across a reload, and it never leaves your device.
