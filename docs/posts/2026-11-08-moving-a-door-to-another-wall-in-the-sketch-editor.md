---
title: "Moving a Door to Another Wall in the Framing Sketch Editor"
seo_title: "Move a Door or Window to Another Wall: Wall Framing Sketch Editor"
date: 2026-11-08
tags: [wall-framing-takeoff, sketch, construction]
description: "The sketch editor's engine can now move a door or window to a different wall in one step, with the same overlap and fit refusals as placing one."
---

In the [wall framing takeoff](/ventures/wall-framing-takeoff/) sketch editor you could slide an opening along its wall, but moving it to another wall meant erasing and placing it again. The engine now has `moveOpeningToWall`: it keeps the opening's kind and width, centres it where you ask (snapped like a new one), and refuses, changing nothing, if the wall is missing, too short or already has an opening there.

This is the engine only. The page's drag tool does not call it yet, so the editor itself behaves as before. One new test in `sketch.test.mjs` covers an overlap, a 20 in wall, an unknown wall or opening, a clamp to the wall end, and the id, kind and width staying the same.
