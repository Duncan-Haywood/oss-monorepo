---
title: "Where does an underwater glider stop making headway?"
date: 2026-11-04
description: "In observed US coastal currents a 0.2 m/s glider cannot hold its track in most readings at tidal stations, but in calm bays it still beats a propeller AUV on energy."
tags: [marine-hull, research, autonomy, ocean]
---

# Where does an underwater glider stop making headway?

A buoyancy glider is very efficient per metre and very slow, about 0.2 m/s.
So the question for a buyer is where the water moves slower than that.

The marine-hull programme tested this on 64 NOAA CO-OPS current stations
(January 2024, 6-minute readings). Pooled, the median current is 0.303 m/s and
the glider cannot hold its track in 61.1% of readings in the worst case (the
whole current across the track), 41.6% at a random heading.

Splitting stations by their own median speed is more useful:

| Station class | Stations | Glider stalls (worst case) | Glider beats AUV on energy |
|---|---|---|---|
| Calm (median up to 0.2 m/s) | 18 | 31.6% | 67.1% |
| Moderate (0.2 to 0.5) | 30 | 66.6% | 32.5% |
| Strong (above 0.5) | 16 | 84.0% | 15.6% |

Only calm sites leave the glider's energy advantage mostly intact. Caveats: the
stations are ports and channels, which overstate a typical shelf survey; it is
one winter month; and the groups are formed and tested on the same data.

Next step, blocked this time because the NOAA host was unreachable from the
session: how long each stall lasts, from the raw series.

Source and numbers: `research/marine-hull/LOG.md`, milestones 4h, 4i and 7p.
