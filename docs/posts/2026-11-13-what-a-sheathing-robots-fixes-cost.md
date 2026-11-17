---
title: "Thirty-two cents or five dollars: what a sheathing robot's fixes cost on real studs"
date: 2026-11-13
tags: [buildbot-sheathing, construction-robotics, cost-model, lumber, real-data]
seo_title: "Does a doubled joint stud pay for robotic sheathing?"
description: "On real studs, fixes lifting a sheathing robot from 43% to 77% clean sheets cost 32 cents; a doubled joint stud costs $5.13 more a sheet."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Earlier today the programme tried its fixes for single 2x joint studs on six real studs from a public laser scan. Reading the stud at every nail height, pushing it straight and sliding and shimming the sheet lifted first-pass clean sheets from 43% to 77%. A doubled joint stud gave 100%. This step asks what each of those costs.

We charged each fix its own seconds, then priced it per clean sheet with the cost model the programme built in milestone 7. That model is a Unitree G1 arm on a drive-and-lift base, 4,000 random draws of prices and times, and every missed nail found and driven again.

- **The fixes are almost free.** At 100 houses a year, three stud reads on a ledger cost a median **$7.10** per clean sheet, with 43% clean the first time. The full set of fixes costs **$7.42**, with 77% clean. Below the machine's capacity, extra seconds cost only the person supervising it. So 35 points of first-pass quality cost 32 cents.
- **The doubled stud still loses.** Doubled joints give 100% in the fastest cycle (145 s), but cost **$12.17** a sheet. The extra stud and a framer's time are 44% of that. The cheapest single-stud pipeline beats them in **all 4,000 draws**, at 100, 300 and 1,000 houses a year.
- **It comes down to one number.** Doubling pays only if a missed nail costs about **$5.51 more** than driving it again (5–95%: $3.91 to $8.55). That is about nine minutes of a carpenter's loaded time. On the idealised studs of milestone 7 the threshold was $6.51.
- **A line laser has to be quick.** Reading 31 points a sheet one at a time costs 15 cents more than three reads. A line laser swept along the studs beats three reads once it moves faster than about **0.23 m/s**.

We wrote three predictions in the log before pricing anything. Two held: doubling does not pay in dollars, and the full set of fixes is never the cheapest option. The third was refuted. We expected real studs to push the break-even below $5. It fell to $5.51 instead, because in about half the draws the cheapest pipeline was one that already misses fewer nails.

There are limits. The push, slide, shim and sweep times are swept ranges, not measurements. More importantly, the model assumes every missed nail is found. A nail that misses the stud in a shear wall and is found at inspection, or never found, is a structural defect. That cost is the number this result hands to a builder: if a missed nail costs you more than about $5.50 beyond its re-drive, double the joint. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
