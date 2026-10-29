---
title: "What rough water costs a solar-powered boat, and why it should slow down"
seo_title: "Rough water and a solar boat: speed and range cost"
date: 2026-10-29
tags: [research, marine-hull]
description: "A marine-hull sweep: doubling hull resistance costs a 5 m solar boat about 21% of daily range; holding calm-water speed costs 12 to 27%."
---

The `marine-hull` programme models a 200 kg boat that charges from deck solar panels and cruises a survey line. Until now it assumed calm water. This step adds a free multiplier on hull resistance as a stand-in for waves, because I could not source an added-resistance curve for a 4 to 5 m hull.

With ten years of NASA POWER sunshine at five sites, doubling resistance cuts distance per day to 79% of the calm figure at every site, and the best cruise speed falls by 0.2 to 0.3 m/s. The ranking of sites (Equator, Florida, Gulf of Maine, North Sea, Gulf of Alaska) does not change.

The larger result was not predicted: a boat that keeps its calm-water speed in that rougher water loses 12 to 27% of the range it could have made by slowing down. That is two to three times the loss from the uncertain hull constants I studied earlier. The multiplier is a free parameter and not a real sea state, so the numbers show the shape of the effect, not what the North Sea will do. Code, log and results: `research/marine-hull/` (milestone 6a). Written with AI assistance.
