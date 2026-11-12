---
title: "A solar boat's 20-day battery feedback doesn't scale with its battery"
seo_title: "Solar USV battery feedback: 20 days holds from 2.5 to 20 kWh packs"
date: 2026-11-12
tags: [research, marine-hull]
description: "In 12 simulated solar survey boats, a 20-day battery feedback works for 10 to 30 W payloads on 2.5 to 20 kWh packs, and fails once payload outdraws the panel."
---

Earlier today the marine-hull programme found a simple speed rule for a small deck-solar survey boat on a year-long mission. Set the day's base speed from the *average* sunlight for that day of the year, then nudge it by how far the battery sits from its target, closing the gap over about 20 days. Tuned on 2015 to 2019 and tested on 2020 to 2024, it went 3.5% further than a rule driven by last week's sun, with about half the avoidable payload downtime.

All of that was one boat: a 10 kWh pack and a 30 W payload. A designer with a different battery or a hungrier sensor suite needs to know whether 20 days is a property of that battery or something more general. One plausible answer is that the feedback should scale with how many days the pack can run the payload alone (13.9 days for 10 kWh at 30 W). We wrote that down as a prediction before running anything, and it turned out wrong.

We ran 12 boats: packs of 2.5, 5, 10 and 20 kWh against payloads of 10, 30 and 50 W, so between 2 and 83 days of storage. Each picked its own feedback constant from the same grid (5 to 90 days) on 2015 to 2019 and was scored on 2020 to 2024 at 30 ocean points.

- **With a 10 or 30 W payload, the pick was 20 days in five of eight boats, and 10 days in the other three** (2.5 kWh at 10 and 30 W, 5 kWh at 30 W). That covers a 24-fold range of storage, so the constant isn't set by days of storage. In all eight, the average-sun rule went further than the last-week rule *and* had fewer dark hours. Using 20 days for all eight stayed within 1% of each boat's own pick in distance, or went further; the cost was up to 1.2 times the last-week rule's dark hours, in the smallest pack.
- **A bigger pack makes the rule matter more, not less.** The gain over the last-week rule is 0.5 to 1.2% at 2.5 kWh and 1.2 to 3.7% at 20 kWh, and the gap to a plan with perfect foresight grows too. A battery that can bank more energy gives a planner more to get right.
- **A payload heavier than the sun can carry is a different regime.** At 50 W the deck averages only 36 W of harvest, so the boat moves only on sunny stretches. There the average-sun rule halved the dark hours but lost 1 to 8% of distance at packs up to 10 kWh, and it wanted a longer feedback (30 to 60 days). One likely reason, found after the fact and not tested on its own: 2020 to 2024 were about 1% sunnier than the 2015 to 2019 average. A rule that holds station whenever the *average* sun is below the payload draw misses many of the few days on which it could have moved.

One of six pre-registered predictions held: the 10 kWh, 30 W boat picked 20 days again, which reproduces the earlier result.

For anyone sizing a solar USV, the practical reading is this: if the panel can carry the payload on average, keep the 20-day feedback (10 days for a pack of 5 kWh or less) whatever the battery. If it can't, expect to tune the controller to the boat and to watch for sunlight drifting from its historical average.

Limits: this is a simulation with calm water, daily time steps and NASA POWER sunlight, and the same 4 m hull throughout. The battery target's 45-day lead was chosen for the 10 kWh, 30 W boat and not re-tuned for each configuration. The pack and payload values are a sweep, not specific vehicles, and there's a single five-year tuning window. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zp).
