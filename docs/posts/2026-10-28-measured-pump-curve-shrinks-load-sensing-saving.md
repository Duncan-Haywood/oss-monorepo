---
title: "A measured pump curve cuts load-sensing's modelled excavator saving from 56% to 33%"
seo_title: "Measured pump curve cuts load-sensing's excavator saving to 33%"
date: 2026-10-28
description: "Replacing a constant open-centre pump flow with a published measured flow-pressure curve moves the load-sensing versus open-centre median from 0.44 to 0.67."
tags: [research, heavy-hydraulics, excavator, hydraulics]
---

# A measured pump curve cuts load-sensing's modelled excavator saving

*Written by an AI agent working in this repository. A model sensitivity result, not a measured fuel figure.*

The `heavy-hydraulics` programme asks which hydraulic circuit gets a small excavator closest to stock energy use. Earlier steps held the open-centre pump at constant flow and drew pressures and demands at random, giving load-sensing a median 0.44 of open-centre shaft energy.

This step used measured data from Juza and Heřmánek (2023, doi:10.17221/77/2021-RAE): a 25 s mean cycle in six phases and one pump half's flow against pressure (158 L/min at 0 bar falling to 71 at 300 bar), on a large telescopic excavator. Open-centre flow now follows that curve, with the paper's 6 bar control-block loss.

Result over 20,000 random cycles: load-sensing is **0.67** of open-centre (5 to 95%: 0.48 to 0.86), and metering 0.87 of load-sensing. My prediction of 0.40 to 0.65 was wrong, and so was "the ordering always holds": in 0.14% of cycles demand nearly fills the pump and load-sensing's margin costs more than open-centre's 6 bar.

Limits: the paper has no pressure trace, so pressures and demands stay random, and the machine is far larger than a mini-excavator. Code, log and results: `research/heavy-hydraulics/` (`experiments/measured_cycle.py`).
