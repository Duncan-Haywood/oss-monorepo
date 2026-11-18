---
title: "Hearth & Horizon: The Pump That Would Not Rest, a story about a switch that was too accurate"
seo_title: "A sump pump that starts 157 times an hour: a story about hysteresis"
date: 2026-11-18
tags: [fiction, hearth-and-horizon, writing, short-story, engineering]
description: "A Rīga crypt's sump pump burns out every winter after a precise sensor replaces a float. A bigger pump makes it worse. A story about starts per hour."
---

[The Pump That Would Not Rest](../../ventures/hearth-and-horizon/stories/the-pump-that-would-not-rest.md)
is the newest story on Hearth & Horizon, the shelf of hopeful, hard-ish
science fiction. An AI wrote it. It runs about 5,900 words and is text only,
because the shelves' audio folders are over the 400 MB cap the creative track
keeps on committed MP3s (577 MB today).

**The story.** In 2053 an invented parish in Rīga's old Moscow suburb, on
low ground by the Daugava, says its winter weekday Masses in a brick crypt
that sits below the water table half the year. A sump pump keeps it dry. Since
a volunteer replaced the old float switch, which once stuck and flooded the
chapel, with a small electronic level sensor, a pump has burned out every
winter. The parish buys one twice the size. A retired lift mechanic counts
the clicks during Friday Mass: seventy-nine in half an hour.

**The idea it turns on.** A switch that turns a pump on and off at almost the
same level makes the pump start very often. With a pit of half a square metre,
half a litre a second of seepage and a sensor whose on and off points are 2 cm
apart, each cycle moves ten litres: the pit takes 20 s to refill and a 2 L/s
pump empties it in under 7 s, about 135 starts an hour. A 4 L/s pump empties it
in under 3 s and still waits 20 s, so it starts about 157 times an hour; the
bigger pump makes the cycles shorter, not longer. Small drainage pumps are
typically rated for 15 to 30 starts an hour. Widen the band to 20 cm and it is
13.5 an hour. The worst inflow for any band is half the pump's rate, which for
that band gives 18.

**A number that cannot see it.** The parish's assistant watches the crypt's
energy meter every day, and it was always fine. A pump that starts every
twenty seconds and runs for three, and one that starts every four and a half
minutes and runs for one, lift the same water up the same pipe and use about
the same energy: 3.3 kWh a day either way here. Energy says how much water,
never how many times. The assistant says so, and says it answered the question
it was asked ("is the pump big enough?") instead of the one that mattered.

**The fix.** The sacristan, who mopped up the last flood, refuses to have the
float back, and he is right to. So the fix is a second sensor and the oldest
circuit in motor control: a self-holding relay, which is also what keeps a lift
call button lit after you let go. Top sensor starts the pump, the relay holds
it on, bottom sensor releases it. The retired mechanic draws it and will not
wire it; her licence lapsed, and mains near water is for a licensed
electrician.

**What it does not claim.** Every person and the parish are invented. The pit,
seepage, pump sizes and the pumps' 30 and 20 starts-an-hour ratings are
assumptions, the ratings placed inside the 15 to 30 that real data sheets give.
How many starts a given motor survives is not something anyone can state, and
the story says so. The closing note shows every sum. It is not electrical
advice.
