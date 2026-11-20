---
title: "Tennis feeder: a stricter vote with more balls did not stop the false alarms"
seo_title: "Tennis feeder: a stricter vote did not stop the false alarms"
date: 2026-11-20
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "On 576 fresh simulated builds, a faster survey drill with a stricter vote had the same 2% false alarms and named fewer short contacts. Nothing shipped."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). Short contacts only show on
the few balls whose contact falls across a revolution's edge. Those
"straddling" balls vote, and the Pi suggests a 1.5 ms take when the votes
for it lead by a margin of 2.

This morning's run found that the simulator had always put each ball at the
same point of the wheel's revolution. Once the release was made random, the
shipped survey told 1 instant-contact build in 36 to set a take it did not
need. On those same builds, a margin of 3 stopped that false alarm, and a
faster survey drill (34-40 m/s shots, about 1.4 times the straddling balls)
kept more short contacts at margin 3 than the standard long drill did.

That was a pattern found after the fact, so we tested it on fresh seeds.

## The test

Before capturing anything we committed a pass mark. The fast drill at margin 3
would replace the long drill at margin 2 only if it misadvised at most 1 of
108 instant builds, and fewer than the shipped pair did, while naming no more
than 11 fewer of 108 short (1.3-2.1 ms) contacts. We simulated 288 builds per
drill: three launchers, a jittery tach and a random release, on seeds no
earlier set had used. We tripled the instant builds, since false alarms were
what the change was meant to buy down.

| | short named, of 108 | 2.4-2.8 ms, of 72 | instant false alarms, of 108 |
| --- | --- | --- | --- |
| long drill, margin 2 (shipped) | 66 | 61 | 2 |
| fast drill, margin 3 (candidate) | 48 | 65 | 2 |
| long drill, margin 3 (not tested) | 37 | 61 | 0 |
| fast drill, margin 2 (not tested) | 75 | 67 | 2 |

It failed on two counts, with the same false alarms and 18 fewer short
contacts named. Nothing on the board or the Pi changed.

## Why the stricter vote missed

More straddling balls mean more true votes, and also bigger chance runs. On
instant builds the fast drill had 3.6 straddling balls each against the long
drill's 2.5. Its two false alarms were a 3-0 vote, which margin 3 lets
through, and a 4-1 vote in the separate 2.5 ms vote, which this margin never
touched. The long drill's false alarms were 2-0 and 3-1, which margin 3 does
stop, but at margin 3 the long drill names only about a third of the short
contacts.

## What we now quote

On a random release the shipped survey names about 61% of 1.3-2.1 ms
contacts and 85% of 2.4-2.8 ms ones. About 2% of instant builds are told to
set a take. The earlier "all of the longer contacts" figure came from the
fixed-phase simulator.

The last row of the table is the lead for next time. At the shipped margins
the fast drill named 9 more short contacts and 6 more long ones, with the same
false alarms. That is now a pattern found after the fact too, so it gets its
own test on fresh seeds before anything changes.

Everything is simulated: one ESC lag, one tach model and a uniform 0-26 ms
release hold. The full write-up, captures and scoring commands are in
`ventures/open-tennis-robots/eval/feed-phase-margin-2026-11-20.md`.
