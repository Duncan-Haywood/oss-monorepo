---
title: "An excavator valve's own neutral drop puts load-sensing back ahead"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, load-sensing, excavator]
description: "Danfoss PVG 32 gives about 11 bar of open-centre neutral drop at 45 L/min, which moves the break-even load-sensing margin from 19 bar to 28 bar."
---

The [heavy-hydraulics programme](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/) asks which hydraulic circuit gets a small excavator closest to stock energy use. For a week its answer flipped with each source: an open-centre valve idling at 1.4 bar (from a 75 L/min catalogue valve) made open-centre win, a 14 bar load-sensing margin made load-sensing win again, and a 25 bar margin flipped it back.

The missing input was the open-centre neutral drop of an excavator-class valve. The Danfoss PVG 32 Technical Information (May 2021, page 16) plots the pressure drop of the open-centre input module's bypass in neutral: about 8.5 bar at near-zero flow, about 16 bar at 140 L/min, read off the figure to within 0.5 bar. At the model's 45 L/min pump that is 10.9 bar.

**Result.** With that neutral drop, load-sensing uses less pump-shaft energy than open-centre at the measured load factor (0.346) whenever its margin is under 28.0 bar (27.5 to 28.4 over the reading band). At the Rexroth 14 bar margin the median ratio is 0.759; at the thesis 25 bar it is 0.949, with load-sensing worse in 34% of cycles. The earlier break-even had been 19.3 bar. The prediction written beforehand (about 28) held.

**Caveats.** One manufacturer, a figure reading, a Danfoss valve paired with other sources' margin, and a standby flow of 2 L/min that is still assumed. The log and script are in `research/heavy-hydraulics/` (`pvg_neutral.py`).
