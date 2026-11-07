---
title: "Why our cargo-drone range model was 1.8x optimistic on a real aircraft"
date: 2026-11-07
description: "A mass-fraction range model gave 167 km for a 25 kg cargo VTOL that publishes 94 km. The gap is cruise drag, plausibly four stopped rotors."
tags: [research, uav, vtol, energy, aerolog-scaling, open-science]
---

# Why our cargo-drone range model was 1.8x optimistic on a real aircraft

Our open `aerolog-scaling` programme sizes battery cargo VTOLs with a simple
mass-fraction model. Checked against the Wingcopter 198 (25 kg, two 814 Wh
packs, 90 km/h), it gives 167 km. The manufacturer publishes 94 km.

- The gap is not hover: hover is 107 Wh of 1,628 Wh.
- With the published 1.98 m span, matching 94 km needs a zero-lift drag
  coefficient of 0.075 at an assumed 0.7 m² wing, about twice a clean airframe's 0.035.
- About four stopped two-blade rotors out of the published eight would supply
  that drag. All eight stopped overshoots it.

This is a plausibility range, not a demonstration. Wing area, rotor tilt
behaviour and the reserve behind the 94 km are not published, and some inputs
came from search-result summaries. The paper draft and every quoted number
(checked against the committed results files) are in
`research/aerolog-scaling/`.
