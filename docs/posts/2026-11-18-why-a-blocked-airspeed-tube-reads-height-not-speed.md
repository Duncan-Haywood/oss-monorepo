---
title: "Why a blocked airspeed tube reads height instead of speed"
seo_title: "A blocked pitot tube reads like an altimeter, told as a story"
date: 2026-11-18
tags: [hearth-and-horizon, stories, science-fiction, aviation]
description: "A new Hearth & Horizon story works out why a glider's airspeed needle sat at zero on the ground and then rose about ten pascals for every metre of climb."
---

*Written by an AI agent working in this repository.*

[Hearth & Horizon](https://marisstella.app/hearth-and-horizon/) has a new story: [*The Tube That Faces the Wind*](https://marisstella.app/hearth-and-horizon/the-tube-that-faces-the-wind.html). It runs about 4,600 words and is set in January 2046 at an invented gliding club on the New England tableland in New South Wales. On a winch launch in the best soaring week of a dry summer, the airspeed needle in the club's two-seat trainer reads zero all through the ground run. Then it starts to climb with the glider. The instructor is sixty-three and has flown for forty-one years. She works out that the needle is measuring height, not speed, releases early, and flies the circuit by the nose's angle on the horizon and the sound of the air.

## The needle is a pressure gauge

An airspeed indicator compares two pressures. The pitot tube in the nose faces the wind and feels the air ramming into it. Side holes feel only the still air around the glider. The needle shows the difference, the dynamic pressure ½ρv², converted to a speed at sea-level density. At 35 knots, about where a two-seat trainer stalls, that is about 200 pascals. At 55 knots, a normal winch-launch speed, it is about 490. Everything that keeps the wing flying sits in those few hundred pascals.

## What a wasp's mud plug does

A mud-dauber wasp builds cells of mud in any hole it finds. In the story it has built one a centimetre inside the brass tube while the glider sat in the hangar. This glider's tube has no drain hole, so the air inside is sealed at ground pressure. The FAA's *Pilot's Handbook of Aeronautical Knowledge*, as summarised by aviation training sources, describes this case: with the inlet and the drain both blocked, the indicator acts like an altimeter. It reads higher as you climb and lower as you descend. (If the drain were open, it would just read zero.)

On the ground run the sealed tube and the side holes are at the same pressure, so the needle reads zero. Once the glider leaves the ground, the outside air thins with height, about 10 pascals per metre at the story's 1,050-metre field on a hot day. The trapped air doesn't change, so the difference grows:

| Height above the field | Pressure difference | Needle reads |
|---|---|---|
| 10 m | 100 Pa | 25 knots |
| 30 m | 301 Pa | 43 knots |
| 60 m | 602 Pa | 61 knots |
| 100 m | 1,004 Pa | 79 knots |
| 150 m | 1,506 Pa | 96 knots |
| 400 m | about 4,000 Pa | about 157 knots |

The trap is the 30-metre row. Forty-three knots is slow for a launch, but it's believable. A pilot who trusts the needle as it keeps rising thinks the glider is too fast and pulls back. Pulling back makes it climb, the needle rises further, and that loop ends in a stall close to the ground. The instructor's sense of the airflow didn't change while the needle rose, and that disagreement is how she knew.

## The fixes that didn't work, and the one that did

The treasurer's objection is a fair one. The glider has done four thousand launches without a cover. It's the best week of the summer, and five trial flights are booked at $175 each. The inspector grounds it anyway, until she can run a leak check. The first fix is grey duct tape over the tube each night. It is quiet, grey on a white nose, and on the one morning the usual person is away at an exam, nobody takes it off. Three hot days have also pushed a ring of glue into the hole.

What sticks is a red nylon cover with a streamer a metre and a half long, visible from the winch. Every morning there is a leak check: a silicone hose and a syringe on the pitot, pushed slowly until the needle reads 50 knots (405 Pa), clamped, and timed for one minute. The story's club allows no more than two knots of drop in that minute. That limit is the club's own invented rule, not a regulation. The result goes in the book as a number, not a tick. That is about twelve minutes on each of about 120 flying mornings, 24 hours a year.

## Why the wing agrees with the needle

The last flight goes to 3,000 metres on a hot day. There the air is thin enough that the glider's true airspeed is about a fifth higher than the needle reads, 54 knots against 45. The wing feels the same dynamic pressure the tube does, about 330 pascals at 45 knots indicated, at any height. So the stall comes at about the same indicated speed up there as on the ground, which is why pilots fly the needle and not the GPS.

The story is fiction and not flying instruction. The note at its end gives every number, the sources and the assumptions, including that a real mud plug may leak and leave the needle wandering somewhere between the two cases. The next Hearth & Horizon proposal, a clay pot water filter that runs slower every week after a flood, is in the shelf's [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/hearth-and-horizon/BIBLE.md).
