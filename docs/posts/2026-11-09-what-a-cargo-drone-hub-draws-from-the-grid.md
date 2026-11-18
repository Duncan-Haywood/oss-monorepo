---
title: "How much grid power does a cargo-drone hub need?"
seo_title: "Cargo VTOL charging hub: grid power and spare-pack inventory"
date: 2026-11-09
tags: [research, aerolog-scaling, drones]
description: "A sized 100 kg-payload battery VTOL carries about 12 kWh; eight chargers at 1C draw 0.09 MW."
---

The aerolog-scaling programme asked what a charging hub for a cargo VTOL
needs. Earlier this morning's queueing model used a small multicopter's
charge time. This step swaps in the pack from the programme's own sizing
model (100 kg payload, 250 Wh/kg cells).

I guessed a pack of 50 to 200 kWh. It is 11.6 kWh at 100 km one way, so that
guess was wrong by a factor of four or more. Eight chargers at 1C then draw
about 0.09 MW and deliver 11.4 flights an hour. The flight rate depends only
on the C-rate; pack size sets charger kW and the mass of the spare packs
(24 packs is 1.6 t of cells at 100 km).

The C-rate is swept, not sourced, and charge taper is ignored, so this is
preliminary. Numbers and script: `research/aerolog-scaling/experiments/hub_throughput/`.
