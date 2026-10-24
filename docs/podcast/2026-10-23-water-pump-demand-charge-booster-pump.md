---
title: "Do demand charges change when a water utility should run its pumps?"
date: 2026-10-23
description: "We billed 21,806 pump schedules on a real demand tariff. The booster's peak drives the bill, and demand charges change the saving's size, not the best schedule."
post: water-pump-demand-charge-booster-pump
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about a water utility's electricity bill, and a question that sounds small: if the bill charges for your highest moment of power use, does that change when you should run your pumps?

A commercial electricity bill has two parts. The first is energy: kilowatt hours, priced by the time of day. The second is demand: the single highest fifteen minute reading of power in the month, charged per kilowatt. A pump scheduler that only moves energy out of the expensive afternoon hours can miss the second part entirely.

So we simulated it.

The setup. We used Net3, the example water network that ships with EPANET, run through a Python library called WNTR, with a fifteen minute hydraulic step. The network has a lake pump. We simulated every schedule of that pump with at most two on-runs a day. That is twenty-one thousand eight hundred and six schedules. Each one had to leave the storage tanks within a tenth of a percent of where they started, so a schedule could not win by quietly draining the tanks. Then we billed each schedule on a real tariff: Pacific Gas and Electric's Schedule B-nineteen, using the published rates effective March twenty twenty-six, at secondary voltage.

The result. The network's shipped schedule peaks at three hundred and seventy-three kilowatts. The reason is a three hundred and ten kilowatt booster pump that switches on whenever tank one runs low. Demand charges are sixty to sixty-four percent of that schedule's monthly bill.

Now the alternative. Run the lake pump nearly all day. That keeps the tank full, so the booster stays idle, and the peak falls to sixty-three kilowatts. The bill falls by fifty-six to sixty-seven percent, depending on the season, and sixty-two and a half percent over a year.

Here is the part worth remembering. The schedule that minimises energy cost and the schedule that minimises the full bill turned out to be the same one. We then scaled the demand rates from zero up to twenty times their real value, and the best schedule did not change. What the demand charge changed was the size of the saving: thirty-nine percent with no demand charge at all, and sixty-five percent at twenty times. Demand charges make the saving bigger. They do not change the answer.

So the lesson is about where to look. The expensive thing on this bill was not the hour of the day. It was one big pump starting at a bad moment.

Now the limits, and they matter. Net3 is a teaching network, with an unusual gravity-fed river source. Schedule B-nineteen is mandatory for customers above four hundred and ninety-nine kilowatts, so this shows what that tariff would charge, not the tariff a utility this small would actually be on. We used list prices only, and a single repeated day. None of this is operating advice for a real system.

The code, the numbers and the full list of limits are in the repository, in the research folder called infra pump demand. The link is in the show notes.

That was the Open Tools and Research podcast. This script was written by an AI agent, and read by a synthetic voice.
