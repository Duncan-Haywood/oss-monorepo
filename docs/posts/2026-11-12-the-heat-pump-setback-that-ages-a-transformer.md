---
title: "Heat-pump diversity helps a transformer 3.5 times. A synchronized night setback costs it 34."
seo_title: "Heat pump diversity, night setback and distribution transformer ageing"
date: 2026-11-12
description: "Thermostat diversity cuts modelled transformer ageing 3.5x, but a shared 06:00 night-setback end with strip heat raises it 34x."
tags: [research, infra-transformer, heat-pump, distribution-transformer, load-diversity, cold-load-pickup]
---

The [infra-transformer](/research/infra-transformer/) model asks when heat pumps and EVs start to wear out the transformer serving a street. Its first version gave every home the same heat-pump draw in the same hour. That is the worst case, and the README said so: real homes cycle at different times, so the group peak is lower than ten times one home's peak. This run measured how much that diversity is worth.

Each of ten homes is now a two-node thermal model (air and building mass) with its own insulation, setpoint and starting temperature, and a thermostat. The model steps once a minute through a typical Greensboro, NC year. We drew 20 different groups of ten homes, and the transformer model runs at one-minute steps too.

Diversity helps, and by about as much as you would guess. With every home on a heat pump and the transformer sized so that today's peak is half its rating, the coincident model gave 0.33 % of insulation life per year. The diverse groups give a median of 0.096 %, about 3.5 times less. In colder Sand Point, Alaska it is worth only 1.4 to 1.7 times, because on cold days every pump runs flat out and there is no cycling left to spread out. The same thing shows inside an hour. Below −5 C the 1-minute peak is only 6 % above the hourly mean, against three times the mean on mild days. Diversity is large when it does not matter and small when it does.

The bigger effect was one we had not set out to measure. Give every home a 3 K night setback that ends at 06:00, with 5 kW of electric strip heat as the thermostat's second stage, and ageing rises to 3.2 % per year. That is 34 times the same homes without a setback. At 06:00 every home's strip heat comes on at once: the coincidence factor is exactly 1.0 and the 1-minute peak rises from 89 kW to 106 kW. Staggering the end of setback across four hours only halves the effect. Locking out the strip heat during recovery, which adaptive-recovery thermostats do, removes it completely. This is the old cold-load-pickup problem (Ihara and Schweppe, 1981), turned up by electrification.

Three caveats matter. The house constants are recalled GridLAB-D defaults, swept over a range rather than fitted to a measured housing stock. The transformer constants are still unverified against IEEE C57.91. And the ten-home groups vary a lot: ageing ran from 0.04 to 0.45 % per year depending on which ten homes were drawn, a wider spread than the coincident-versus-diverse gap. The result to take to a utility is about thermostats, not about diversity. Before a street goes all-electric, check how its heat pumps recover from setback. One more finding, from switching to one-minute steps: for steep loads like uncoordinated EV charging, the original hourly model overstated ageing by about 1.4 times.

Code, the full tables and the sensitivity sweep are in [`research/infra-transformer`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/infra-transformer).
