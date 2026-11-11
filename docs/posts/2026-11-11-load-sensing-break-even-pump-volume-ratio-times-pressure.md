---
title: "Why the break-even load-sensing margin is 20 bar on one machine and 87 on another"
seo_title: "Load-sensing break-even margin: pump volume ratio times pressure"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "Load-sensing beats a fixed open-centre pump below a margin of (r − 1) times working pressure, plus spool drop and idle terms. Tested on 3,000 cycles."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
asks which hydraulic circuit a small shop can build to get closest to stock
energy use. Two steps earlier today gave the same answer in very different
sizes. The margin at which a load-sensing pump uses as much energy as a fixed
open-centre pump is about **20 bar** on our synthetic excavator cycles. On a
measured 6 t wheel loader
([Linjama et al., Zenodo 10639199](https://doi.org/10.5281/zenodo.10639199),
CC BY 4.0) it is **87 bar**. That is a factor of four, and the obvious question
is where it comes from.

**The split.** Earlier today the break-even became a formula,
m* = (S + D + I) / B: surplus pump flow pushed at load pressure, plus spool
drop, plus idle bleed, over the volume load-sensing delivers. The surplus term
splits further, with no approximation. Let r be the fixed pump's volume over the
volume the work needs while the machine moves, and p the working pressure. Then

    m* = β [ (r − 1)·p  +  covariance  +  r·d ]  +  idle

where β is the share of load-sensing volume delivered while moving, and the
covariance term is positive when the machine works hard while it moves slowly.
A builder knows r and p roughly: the pump size against the flow the
cylinders actually take, and the usual working pressure.

**What it says on 3,000 cycles.** We wrote six predictions down before writing
any code. On the synthetic force-model cycles r has median **1.43** (predicted
1.35 to 1.55, held) and the demand-weighted working pressure is only **33 bar**.
So the surplus term is 12 bar, idle bleed adds 8 and the covariance term
averages zero (but swings ±4 bar per cycle, a little more than predicted). The
two-number rule (r − 1)·p + r·d, which ignores idle time, reads **31% low**, so
we were wrong to expect it within 25%. With the idle term put back, it is within
a median **6%**. The pressure hardly ranks cycles (Spearman 0.12) while the
volume ratio does (0.77): in this force model it is the flow profile that
decides.

**Back to the factor of four.** The loader's r is 1.78, so (r − 1) is 1.8 times
the synthetic 0.43. Its surplus term of 78 bar then needs a working pressure
near 100 bar, three times the force model's 33. That last step is an inference.
The data host refused our connection this session, so it is registered as a
prediction for the next run that can download the trace. If it holds, the
programme's synthetic break-evens are low mainly because the force model works
at low pressure. That is the next thing to check against a published excavator
pressure trace.

**For a builder.** Load-sensing beats a fixed open-centre pump at any margin
below about β[(r − 1)·p + r·d] plus the idle term. On a peaky machine at
100 bar, that is far above any load-sensing margin on sale. On a light, smooth
cycle at 30 bar it is near 20 bar, and the margin you pick matters.

Code, results and the registered predictions:
[`breakeven.decompose`](../../research/heavy-hydraulics/src/heavy_hydraulics/breakeven.py),
[`experiments/breakeven_volume_ratio.py`](../../research/heavy-hydraulics/experiments/breakeven_volume_ratio.py),
[results](../../research/heavy-hydraulics/experiments/breakeven_volume_ratio_results.txt),
[research log](../../research/heavy-hydraulics/LOG.md). This is a model result,
exact only inside the programme's energy model. It is not engineering advice
for a particular machine.

*Written with AI assistance (Claude Code).*
