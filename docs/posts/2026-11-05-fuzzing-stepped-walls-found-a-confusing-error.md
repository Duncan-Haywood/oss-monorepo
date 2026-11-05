---
title: "Fuzzing the stepped-wall framer found a confusing error, not a wrong count"
seo_title: "Stepped wall framing takeoff: validating step segments"
date: 2026-11-05
tags: [wall-framing-takeoff, testing, construction]
description: "A random check of stepped walls showed a step 6 to 12 inches from an end passed validation, then failed with an error naming a segment the user never typed."
---

`wall-framing-takeoff` frames a wall whose studs change height by splitting it into level segments, each framed as its own wall. I ran 3,000 random stepped walls through the splitter and the takeoff, looking for crashes or bad counts.

There were no crashes. The finding was an error message. The splitter accepted a step as close as 6 inches to a wall end or to another step, but the layout engine refuses any wall under 12 inches. A step at 8 inches therefore passed validation and then failed with "Wall A (a): length must be at least 12 inches", naming a segment the user never wrote.

The splitter now refuses those steps up front, with the wall and the rule in the message, and the test suite covers both sides of the 12 inch line. Random plans also surfaced tees typed at a step, which are user error and already rejected downstream. This was a hand-built random check on invented walls, not a real stepped plan, which is still what the project needs.
