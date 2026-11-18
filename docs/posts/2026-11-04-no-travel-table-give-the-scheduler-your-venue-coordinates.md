---
title: "No travel table? Give the league scheduler your venue coordinates"
date: 2026-11-04
description: "The multi-division league scheduler can now estimate drive times between venues from their latitude and longitude, so teams stop criss-crossing town."
tags: [league-schedule-generator, scheduling, sports]
---

# No travel table? Give the league scheduler your venue coordinates

The scheduler can already price a venue change by minutes on the road, but it
needed someone to type every pair: three venues means three times, eight means
twenty-eight. Most organisers never do, and the scheduler then treats every
change as equal.

Now a line like `Park @ 40.7128, -74.0060` is enough. Any pair with
coordinates on both sides and no typed time gets an estimate: straight-line
distance times 1.3 for roads, at 40 km/h, rounded up, never under 3 minutes.
A time you type always wins.

Honest limits: it is a rule of thumb, checked only by arithmetic (0.1 degree of
latitude comes out at 22 minutes), not against a real league's drive times. A
river or a motorway makes it wrong for a pair, which is why typed times
override it. A real league's actual times are the open item.
