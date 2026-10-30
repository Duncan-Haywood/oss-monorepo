---
title: "How much does an unknown standby flow matter to load-sensing on an excavator?"
seo_title: "How much does unknown standby flow matter to a load-sensing excavator?"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, excavator, sensitivity]
description: "Sweeping the assumed load-sensing standby flow from 0 to 10 L/min moves the break-even pump margin only from 29 to 24 bar."
---

Our `heavy-hydraulics` model compares load-sensing with open-centre circuits on a small excavator. One input had no source: the standby flow a load-sensing pump passes at idle, assumed at 2 L/min.

With the open-centre neutral drop read from Danfoss's PVG 32 curve (10.9 bar), we swept it from 0 to 10 L/min. The margin above which load-sensing stops saving energy falls from 29.1 bar to 24.0 bar, about 0.5 bar per L/min. I had predicted over 30 bar at zero and under 25 at 8 L/min; both missed by a small amount.

So Rexroth's 14 bar margin wins at every standby flow tested, and the 25 bar margin from a thesis model only loses at about 8 L/min or more. The ranking holds unless standby flow is large for a 45 L/min pump. The standby flow is swept, not sourced, and the neutral drop is a figure reading. Log and script: `research/heavy-hydraulics`, milestone 2o.
