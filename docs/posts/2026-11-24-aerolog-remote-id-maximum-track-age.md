---
title: "A maximum Remote ID track age for the drone hold: dearer than a wider radius, but it needs no burst model"
seo_title: "Remote ID maximum track age vs fixed radius for drone holds"
date: 2026-11-24
tags: [research, uav, airspace, safety, remote-id]
description: "Waiting out Remote ID outages costs 3.5 times a wider radius under geometric bursts, but a radius sized for them misses 1e-7 by 26 times under a Pareto tail."
---

The [`aerolog-scaling`](../../research/aerolog-scaling/) programme has spent
today pricing a hold-until-clear rule for delivery drones that climb and
descend through other operators' altitude layers: first with
[known intent](2026-11-24-aerolog-drone-transit-hold-rule.md), then with
[stale broadcast Remote ID tracks](2026-11-24-aerolog-remote-id-stale-tracks.md),
then with [bursty message loss](2026-11-24-aerolog-remote-id-bursty-loss.md).
That last step ended on a recommendation: bound the time since a track's last
message, not the reception rate. This step priced the recommendation, and it
turned out to be half right.

## The two rules

**Fixed radius (FR).** Before a transit, wait until no intruder is predicted
within one protection radius. The radius is sized so that the chance of
missing a true collision, averaged over how old each track's newest message
is, meets 1e-7 collisions per flight hour. To size it you need the
distribution of track ages, and under bursty loss that means the distribution
of burst lengths.

**Maximum track age (cut-off).** If the receiver has heard nothing for more
than A_max seconds, it declares surveillance lost and the drone waits until a
message arrives. Otherwise every intruder is checked at the radius for the
oldest age the rule admits. No transit starts on an older track, so the
collision target holds whatever the channel does. The cost is the wait.

## What came out

On the programme's 48 New York layouts (holds read from earlier steps' stored
grids; predictions pushed before anything was computed; 5 of 6 held):

- **Under geometric bursts, the cut-off is dearer.** At <1 m/s speed accuracy,
  half the messages lost and 10 s mean bursts, the best cut-off (A_max 50 s)
  holds 0.46 s and 0.39 s per flight (12 and 16 operators). The fixed radius
  holds 0.13 s and 0.12 s. With coded reception the gap is 3.6 to 3.8 times.
  Waiting out a shadow costs more than widening the radius.
- **But the fixed radius's guarantee rests on the burst tail.** Keep the same
  mean loss and mean burst and give the bursts a Pareto tail (index 2.5), and
  the radius sized for geometric bursts gives **26 times** the 1e-7 target.
  Across the sweep it is 8.7 to 62 times, and 3.5 to 18 times at the lighter
  index 4. No source we could find has measured burst lengths for Remote ID
  reception.
- **Under that heavy tail the cut-off is also cheaper.** It holds 15.4 s and
  13.2 s per flight. A fixed radius sized for the true tail needs 740 m and
  holds 29.1 s and 20.2 s. At index 4 the fixed radius still wins.
- **At ten times the demand** the best A_max shortens to 30 s. With 100 s
  bursts the cut-off holds about 66 to 83 s per flight, while the fixed
  radius saturates (tens of thousands of seconds).

## What it means for a procedure

Certify the hold with a maximum track age of about 30 to 60 s, because its
collision bound needs no model of the channel. Move to the fixed radius alone,
which is about 3.5 times cheaper if bursts really are geometric, only once a
receiver's burst-length law has been measured. So the useful next measurement
is a Remote ID receiver log with burst lengths, not more modelling.

The limits are those of the earlier steps (one city, synthetic operators,
straight legs, no wind, 95% accuracy bounds read as the error). On top of
those: the channel is receiver-wide, so one shadow hides every intruder at
once. The burst laws are swept, not measured. The hover exposure during the
wait is not added. All of it is preliminary.

Code and numbers:
[`track_age_cutoff.py`](../../research/aerolog-scaling/experiments/hub_airspace/track_age_cutoff.py),
[`track_age_cutoff_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/track_age_cutoff_results.txt),
and the paper draft's new Section 6.10(f) in
[`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md).
