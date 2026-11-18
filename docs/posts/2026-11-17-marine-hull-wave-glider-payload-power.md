---
title: "A Wave Glider out-sails a solar boat at high latitude, but its sensors are dark most of the winter"
seo_title: "Wave Glider vs solar USV: payload power and dark days by latitude"
date: 2026-11-17
tags: [research, marine-hull]
description: "On its own 225 W deck and 6.8 kWh pack, a Wave Glider's 30 W payload is dark 229 days a year at 46 to 60 degrees, yet it still out-sails a solar boat there."
---

Earlier steps of this programme compared a 4 m deck-solar survey boat with a Wave Glider, the wave-powered surface vehicle, month by month along two ocean meridians. The boat wins within about 20 degrees of the equator and the Wave Glider wins poleward of about 40 degrees in winter. But the comparison was lopsided. The boat paid for its 30 W payload from its own panel and battery. The Wave Glider got its wave-powered distance with no electrical bill at all, although its sensors also run on deck solar panels and a pack.

This step gave the Wave Glider the same bill. We used the SV3's published maxima, 225 W of solar and 6.8 kWh of storage (Liquid Robotics' comparison table), and ten years of NASA POWER daily sunlight at 30 ocean points: 300 one-year missions, each launched with a full pack on 1 January. The vehicle's own electronics (navigation, satellite link, rudder) come first. No source we could open gives their draw, so we swept it from 0 to 10 W. The predictions were committed before the run.

What we found (six of nine predictions held):

- **At the same load, the Wave Glider's payload is dark at least as often as the boat's, in all 300 point-years.** The two decks are within 2% of each other (191 W and 196 W after losses) and the Wave Glider's pack is a third smaller.
- **With a 5 W bus, its 30 W payload is dark 147 days a year at 31 to 45 degrees and 229 at 46 to 60.** The boat's minimum is 98 and 173.
- **The largest payload it can run all year without a dark day** is 18 to 47 W within 30 degrees, 10 to 13 W at 40 degrees and 0 to 6 W at 50 to 60. A 2022 paper's figure of 10 W for payloads holds to about 40 degrees.
- **It still out-sails the boat with its sensors on.** It loses 24 to 57% of its kilometres to dark-payload hours at 40 degrees or more. We predicted that counting only the kilometres sailed with the payload on would hand at least half the high-latitude points to the boat. None of the 14 flipped. The Wave Glider's payload-on distance in 2024 is 1.02 to 25 times the boat's, with a median of 1.65. In the North Sea it is 12,278 km against 7,860. The margin is thin at 60 N in the Pacific (7,210 against 7,057) and in the Gulf of Maine (14,102 against 13,594). The boat also sits out the dark months, holding station so its battery goes to the payload. Only one point, 30 N in the Pacific, changes hands.
- **The bus load matters more than we expected.** Going from 3 W to 10 W adds 54 dark days a year at 40 degrees or more. A 30-day battery reserve for the bus does not keep the vehicle steering through a 50 to 60 degree winter either: 38 point-years still lose it.

For a planner, this splits the high-latitude question in two. The hull decides how far the line runs, and the Wave Glider wins that. The power system decides whether anything is measured on it, and at 50 to 60 degrees neither vehicle has its sensors on for even half the year. A year-round sensor line up there needs more panel, more battery or a duty-cycled payload, whichever vehicle carries it.

Limits: the SV3 figures are the vendor's maxima, which favours the Wave Glider. Its bus load is unsourced. We did not model panel wash-over or shading on either deck. Energy moves in daily steps. The Wave Glider's distance is an ERA5 wave plan for one 2015 vehicle state in 2024 only, and the boat runs in calm water.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_waveglider_payload.py`, `experiments/results_waveglider_payload.txt`).
