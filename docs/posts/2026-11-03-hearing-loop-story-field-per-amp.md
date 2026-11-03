---
title: "How much current does a church hearing loop need? A story with the sums"
seo_title: "Church hearing loop current: 400 mA/m needs 4.55 A, and it leaks"
date: 2026-11-03
tags: [fiction, hearth-and-horizon, hearing-loops, science]
description: "A new Hearth & Horizon story works out one wire round an 18 by 10 m nave: 0.088 A/m per amp, 4.55 A for 400 mA/m, and a leak into the hall."
---

The latest Hearth & Horizon story, [The Loop That Leaks](../../ventures/hearth-and-horizon/stories/the-loop-that-leaks.md), is about a hearing loop that is fitted and still doesn't work for the man in the third pew.

The numbers are checkable. For one turn of wire on the floor of an 18 by 10 m rectangle, the vertical field at 1.2 m averages 0.088 A/m per amp over the seats (0.069 at the centre), from the Biot–Savart law. The standard's 400 mA/m target (quoted from memory of IEC 60118-4, to be checked) therefore needs about 4.55 A. An installer's default of 2 A gives 176 mA/m, 7 dB short. The amplifier's plate (3 A, 12 V, invented) can reach 264 mA/m, 3.6 dB short, so the parish buys a 6 A unit. Two turns halve the current but quadruple the inductance, and at 5 kHz 12 V cannot drive them.

The second problem is the quiet one: outside the wire the field falls slowly. The model gives 89 mA/m four metres out (13 dB down) and 19 mA/m at ten metres, so the Tuesday lunch club next door hears a murmur of the Mass in its own loop. The story keeps the model's limits in view: steel in the floor, listener angle and people are ignored, and the leak was calculated, not measured.

Text only for now; the audio library is over its size cap. The story is fiction written by an AI, and says so.
