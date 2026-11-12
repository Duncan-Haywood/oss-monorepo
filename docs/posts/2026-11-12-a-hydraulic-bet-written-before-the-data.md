---
title: "A hydraulic bet written down before the data: what a smaller pump should cost an excavator"
seo_title: "Smaller fixed pump vs load-sensing on an excavator, before the data"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, pre-registration]
description: "The paper draft now carries the excavator volume ratio (2.38). A smaller fixed pump priced in cycle time is registered and scripted, not yet run on data."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a load-sensing pump is worth it over a fixed
open-centre pump on a small earthmover. Earlier today it measured the two
numbers its break-even rule needs on public excavator data. The first was the
working pressure: a median of 174 bar on a 49 t class machine. The second was
the volume ratio, the oil a fixed pump delivers over the oil the work uses:
2.38 on a 7.5 t class machine, from its joint motion and published cylinder
sizes. Together they put the load-sensing margin a fixed pump would have to
beat near 139 bar. Commercial margins run 14 to 25 bar.

**What landed in this run.** The paper draft
([`paper/draft.md`](../../research/heavy-hydraulics/paper/draft.md)) now has a
section 3.7b on the volume ratio. It covers the method, the check that the
derived p99 cylinder demand (218.8 L/min) matches the machine's published
219 L/min pump with nothing fitted, the 1.95 to 3.08 range over the geometry
the files cannot pin down, and the limits: the pressure and the flow come
from different machines. The abstract used to end "no measured excavator
trace was found". That sentence is gone. The draft now says what the
excavator data do show and what is still missing, which is a fuel record.
`paper/check_numbers.py` checks 183 numbers quoted in the draft against the
results files they come from, and none is missing.

**What did not land.** The obvious counter-move for a builder is a smaller
fixed pump. It wastes less oil, but the machine slows whenever demand
exceeds it. On the loader that trade came out badly. To match load-sensing's
energy, the pump had to shrink to 28.5 cc, and the loader took 39% longer to
do the same work. The same test on the excavator is written, with six
predictions registered before any code existed. It rests on a short identity.
If the actuators slow so that the pump delivers exactly the demanded volume,
the pump's ratio is

    r(q_p) = E[max(q_p, q)] / E[q]

over the moving samples. Two things follow. r falls toward 1 as the pump
shrinks. Scaling the demand and the pump together leaves r unchanged, so the
time cost at a given energy does not depend on the one lever scale the data
cannot fix. The function and its inverse are in `measured.pump_ratio` and
`measured.pump_for_ratio`, and a test checks them against the loader's slowing
rule.

The data host refused this session's network proxy (an HTTP 403 on
huggingface.co), so the script has only been run on random noise, to show
that it executes. Those numbers describe noise, so they are neither
published nor used. The predictions stay blind until a run that can reach
the host executes one command and grades them, as the
[log](../../research/heavy-hydraulics/LOG.md) records under milestone 6a.

*Written with AI assistance (Claude Code). The data are
[`fuxi-robot/excavator-motion`](https://huggingface.co/datasets/fuxi-robot/excavator-motion)
(CC BY-NC-SA 4.0). Only derived statistics are published, never the data.*
