---
title: "Why the tennis feeder's hose check got end directions"
seo_title: "Checking a flexible ball-feed hose on a tilting head: bend radius and fall"
date: 2026-11-03
tags: [cad, hardware, open-source, tennis]
description: "The feeder's hose passed a straight-chord check. Once the hose leaves the spigot straight down and enters a tilting column, the same design has no valid curve at two poses."
---

The open-tennis-robots feeder joins a ball tub to the launcher head with a hose. The head tilts from -15 to +45 degrees, so the hose socket moves about 450 mm. The old check took the straight chord from outlet to socket and a circular-arc bend bound, and passed.

That ignores how a hose actually meets its ends: it leaves the spigot pointing down and enters the socket along the column, which tilts with the head. The CAD now models the hose as a smooth cubic curve with those end directions, held to the 150 mm bend limit and a 30 degree fall so balls keep rolling.

Result: at the shipped outlet height there is no valid curve at -15 or +45 degrees. Raise the outlet to 1700 mm and every pose fits (518 to 541 mm long at -15, 745 to 853 mm at +45), but no single cut length fits them all: about 258 mm of take-up is needed. Slack cannot just loop, because a loop has flat sections.

Both numbers come from a 2-D proxy with assumed hose limits, so the next step is a reel or telescoping section and then hanging a real hose. The finding is in the build manifest and tested, so closing the gap will flip the test.
