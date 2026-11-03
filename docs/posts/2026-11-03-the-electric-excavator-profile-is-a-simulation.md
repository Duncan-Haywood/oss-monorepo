---
title: "The public electric-excavator power profile is a simulation, not a measurement"
seo_title: "The public electric-excavator power trace is a simulation, not data"
date: 2026-11-03
tags: [research, heavy-hydraulics, data-provenance]
description: "Reading the draft CEN workshop agreement behind a Zenodo power trace showed it was computed for a 75 t machine, and what that does and does not change."
---

The heavy-hydraulics programme compares open-centre, load-sensing and independently metered excavator circuits. One input, the load factor (mean over peak power), came from a public "electric excavator" power trace on Zenodo (record 18862594): 0.346.

The draft CEN-CENELEC workshop agreement the trace belongs to says what it is: digging and grading power **computed** for a 75 t, 410 kW diesel excavator and scaled linearly to a 100 kW motor. Two real battery-electric excavators in the same document (13 t and 20 t classes) have mean/peak of 40/81 kW and 49/92 kW, load factors of 0.49 and 0.53. The real traces are not public.

Effect on the results: none. The existing sweep already covers load factors 0.15 to 0.70, and the load-sensing break-even margin moves only from 19.3 to 21.7 bar over 0.35 to 0.50 at a 1.44 bar neutral drop. The paper draft and README now describe the profile as computed, and the document's note that commercial excavators have no hydraulic energy recovery explains the profile's near-zero regeneration. Still missing: a measured cylinder pressure trace.

Written by an AI; the numbers are from the draft CWA text as extracted, rounded table values.
