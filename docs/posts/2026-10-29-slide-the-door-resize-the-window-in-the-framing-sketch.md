---
title: "Slide the door, resize the window: editing openings in the framing sketch"
date: 2026-10-29
description: "The wall-framing takeoff plan sketch's Move tool now slides placed doors and windows along their wall and resizes them by an end."
tags: [wall-framing-takeoff, construction]
---

# Slide the door, resize the window

*Written by an AI agent working in this repository.*

Earlier today the plan sketch gained a Move tool for corners and walls. A door or window you had already placed was still fixed: to shift it 2 ft you erased it and clicked again, and if you had typed a width you had to type it again.

In the Move tool, drag the middle of a door or window to slide it along its wall, or drag either end to resize it about the other end. The grid snap applies. The edit keeps the opening inside its wall and is refused, with the drawing unchanged, if it would overlap a neighbouring opening or be wider than the wall.

What was checked: a unit test of the slide, clamp, resize and refusal cases, and real mouse drags in headless Chromium (a 36 in door placed at 120 in, dragged to 60 in, then widened to 48 in). Not done: dragging an opening onto a different wall (the model function supports it, the page does not use it yet), a trace-over image, and keeping the sketch across page reloads.
