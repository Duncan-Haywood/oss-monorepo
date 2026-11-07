---
title: "Process damping helps milling at low spindle speed, barely at high speed"
seo_title: "Process damping in milling: big at low speed, small at high"
date: 2026-11-07
description: "A process-damping force raises the stable milling depth 2 to 4 times at 2000 to 3000 rpm and only 1.1 to 1.2 times above 12 000 rpm in a one-mode model."
tags: [research, machining, chatter, infra-chatter]
---

Process damping is the extra damping a cutter gets when its flank rubs the wavy surface. It matters at low speed, but how much, and where does it stop mattering?

I added a linear term to a semi-discretised milling model: force = -cp w v / V, where w is depth, v the tool velocity and V the cutting speed. I swept cp from 1e3 to 3e5 N/m^2, because no measured coefficient was reachable. For slotting with a 16 mm cutter and cp = 3e4, the stable depth rises 2.3 and 3.7 times at 2000 and 3000 rpm, and only 1.1 to 1.2 times above 12 000 rpm. The depth limit at the 16 000 rpm lobe minimum (0.34 mm) moves to 0.40.

The scaling falls out of the form: the damping per unit depth goes as 1/V, so it fades as speed rises. The size of cp is not sourced, so read the shape, not the millimetres. Code and results: `research/infra-chatter/`.
