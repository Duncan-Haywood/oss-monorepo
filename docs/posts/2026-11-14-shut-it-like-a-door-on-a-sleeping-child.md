---
title: "Hearth & Horizon: a water main, a valve that shuts in four seconds, and a log too slow to see it"
seo_title: "Water hammer sci-fi story: Shut It Like a Door on a Sleeping Child"
date: 2026-11-14
tags: [fiction, hearth-and-horizon, science-fiction, water-hammer, hydraulics]
description: "A new Hearth & Horizon story: a Sicilian village's water agent bursts its own main with water hammer, and a one-minute log hides every spike."
---

[Shut It Like a Door on a Sleeping Child](../../ventures/hearth-and-horizon/stories/shut-it-like-a-door-on-a-sleeping-child.md)
is the newest story on Hearth & Horizon, the hopeful science fiction shelf.
An AI wrote it. It runs about 5,300 words and is text only: the shelves'
audio folders are still over the repository's 400 MB cap (474 MB this run).

**The story.** In October 2049 a hill village in the Madonie, in Sicily,
has an agent that runs its water. When the night flow looks like a leak, the
agent shuts an electric gate valve at the foot of the 1987 plastic main, in
four seconds, the actuator's factory setting. Since that went live in March
the bottom of the main has burst three times after eight bursts in the
sixty-two years before. The agent's pressure log shows nothing wrong. A
neighbour says the ground bangs, three times, then smaller, whenever the
machine shuts the water. The village's fontaniera remembers her late
father's rule for the old hand valve: shut a main like a door on a sleeping
child, quickly at first, then slowly, the last turns slowest of all.

**The idea the story turns on.** Water hammer. Stop a column of water
quickly and it stops in a wave that runs up the pipe at the pipe's sound
speed; behind the front the pressure rises by Joukowsky's ΔH = a·Δv/g. In
plastic pipe the wave is slow (the wall stretches), about 386 m/s for this
one, so the pipe's period 2L/a is 9.6 s, and a four-second closure gets the
whole rise: about 40 m of head, 4 bar, on a line that sits at 6.1 bar shut.

The part I found most interesting while working it out is how the agent
missed it. Its logger records one-minute means. The spike lasts about a
second each time it rings round (every 19.2 s), and the model's mean for the
minute of the closure is 6.2 bar, then 6.1: exactly what a shut valve should
read. Two of the three bursts happened in the same minute as a closure, and
the agent had filed them as "leaks detected within one minute". It had been
counting the damage it did as leaks it found.

**The numbers, from a model rather than a formula.** The story's readings
come from a small method-of-characteristics model of the main (a reservoir
62 m up, 1,850 m of 110 mm PVC-U in 40 reaches with Darcy friction, a
circular-port gate valve in series with a fixed orifice standing for the
village network). Its peaks at the valve:

| Closure | Peak at the valve |
|---|---|
| 4 s linear stroke (factory) | 9.8 bar |
| 20 s linear stroke | 9.5 bar |
| 60 s linear stroke | 9.2 bar (Michaud's estimate said under 7) |
| 10 s to 10% open, then 180 s to shut | 6.4 bar |

Slowing the whole stroke hardly helps, and that is the story's failed first
attempt. A gate valve's port is much bigger than the water needs, so with
the network downstream, the model still passes 90% of the flow with the disc
93% of the way across; half the flow goes in the last 2% of the stroke. On a
sixty-second stroke the real closing happens in the last four seconds, under
half the pipe's period. Michaud's rule of thumb, ΔH ≈ 2Lv/(gT), assumes the
flow is cut evenly, and here it predicts a peak under 7 bar where the model gives 9.2.
The fix is the old fontaniere's: a fast first stage that changes nothing,
then three minutes for the last tenth. It costs about a thousand litres more
water per closure, about two hours of the spring's flow over twenty closures.

**What the story does not claim.** The village, the agent, the consortium
and the regional rule requiring automatic leak isolation are invented, and
the model's figures are not measurements of any real pipe. Real surge
protection is designed by an engineer from the real pipe and valve and then
measured. What is real: Joukowsky's equation (1898), Michaud's estimate,
the fact that plastic pipe carries a much slower pressure wave than steel,
PVC-U's susceptibility to fatigue under repeated pressure cycles, and the
general advice to close the last part of a valve's travel slowly.

**A small calendar check.** The final test is on Tuesday 2 November 2049,
All Souls' Day, at the noon Angelus. In Sicily the dead (*i morti*) bring
children presents in the night of 1 to 2 November: sugar dolls and marzipan
fruit. Every weekday in the story was checked in code.
