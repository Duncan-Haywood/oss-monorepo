---
title: "A solar boat goes 10 to 28% further once its power figures come from datasheets, not guesses"
date: 2026-10-29
tags: [research, marine-hull, solar, simulation]
description: "Swapping a guessed hotel load and panel efficiency for published figures raises a simulated deck-solar boat's daily range by 10 to 28% at three energy-limited sites, and leaves its best speed at 1.1 to 1.5 m/s."
---

The marine-hull programme simulates a small deck-solar boat on ten years of NASA POWER sunshine at five sites. Its last sensitivity run found that the boat's fixed electrical load and its panel efficiency mattered more than the hull, and that both were my guesses. Milestone 5l replaces them with published numbers: a Wave Glider's 5 to 20 W average power and a rigid Maxeon 3 module's 22% efficiency.

Result: at 10 W and 0.17 to 0.22 efficiency, a 5 m boat covers 10 to 28% more km/day than before at the Gulf of Maine, North Sea and Gulf of Alaska. The best constant speed moves by at most 0.2 m/s there, and the ordering of the sites does not change in any of the 16 cases. I had predicted a bigger speed shift and a 1.5x gain; both predictions were wrong, and the log says so.

Caveats: the load figure is another vehicle's mission average, the datasheets were seen as search snippets because the vendor host was unreachable, and the hull constants are still unsourced. Log: `research/marine-hull/LOG.md`.
