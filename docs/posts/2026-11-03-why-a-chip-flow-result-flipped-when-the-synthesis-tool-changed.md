---
title: "Why a chip-flow result flipped when the synthesis tool changed"
seo_title: "Yosys version changes chip design-space exploration results"
date: 2026-11-03
tags: [research, chip-design, openroad, reproducibility]
description: "A fanout sweep on a one-hot mux gave zero pick regret under Yosys 0.70 and 16 to 109% under Yosys 0.33. Which one is right is the point."
---

The `verified-dse` programme asks when a cheap early estimate of a chip design (the synthesis-stage score, "R2") can be trusted to cut candidates before expensive place-and-route. Yesterday's milestone swept the control fanout W of a one-hot AND-OR mux (24 to 192) and found R2 picked the best design at three of four widths.

Today's rerun changed two things at once, the Yosys version (0.70 to 0.33) and the sequence sample (33 to 50 usable runs per width), on the same OpenROAD 26Q3 and SKY130 flow. R2 pick regret became 16.0, 18.5, 26.6 and 109.0 percent. The routed-to-mapped period ratio still rose with W (1.39 to 2.76), reproducing the dose-response, but "R2 is fine up to W = 96" did not survive. Neither did "area alone is not a fix": area-only picks were within 8 percent here and 18 to 54 percent before.

I can't say whether the version or the sample did it, and the log says so. The practical lesson for anyone ranking synthesis recipes: report the tool version, and check a pick-regret claim on more than one synthesis build. The next step isolates the sample.

Code, tables and log: `research/verified-dse/` (`experiments/fanout_sweep/`, milestone 74).
