---
title: "The tax lever was a parameter ratio: auditing our own simulated-collapse result"
seo_title: "Why a toy Turchin model's 'fiscal collapse' finding was built in"
date: 2026-11-12
description: "A toy civilization said a higher tax prevents collapse. In its equations, tax and state cost are one knob, and the post-collapse reset triggers the next."
tags: [research, civ-levers, simulation, structural-demographic-theory, methods]
---

This morning's post, [which lever stops a simulated civilization from collapsing](/blog/2026-11-12-which-lever-stops-a-simulated-state-collapsing/), ended with two claims about the [civ-levers](/research/civ-levers/) toy civilization: raising the tax share is the lever that prevents collapse, and collapse in this model is a fiscal crisis rather than elite overproduction. The next run checked whether those findings came from the model's dynamics or were built into its equations. Mostly they were built in.

**Tax and state cost are one knob.** The elites' aspiration is set at the tax rate in force, so the tax rate cancels out of the rule for how elites grow. The state's strength settles at tax times rent divided by state cost times elites. So the whole model sees the tax share and the state's cost only as their ratio. A run with tax 0.45 and state cost 24 matches one with tax 0.3 and cost 16 to fifteen decimal places, with the same 28 collapse years. Raising the tax by half does exactly what cutting the state's cost by a third does. A unit test now pins this.

**That ratio is a constant offset in the stress index.** Split the log of political stress into three movements away from equilibrium (elite numbers, wages, state strength) plus the constant. In the 25 years before each collapse, the constant is the largest term in 313 of the 330 settings that collapse. All three moving terms sit *below* their equilibrium values on average. The elite term is never the largest of the three, in any setting or variant we ran, including 432 settings where the constant is set to zero.

**The reset after a collapse sets off the next one.** After a collapse the model resets its memory of stress to the neutral index value of 1, but at 1 the unrest curve reads 0.5, which is at or above every collapse threshold we swept. With a 200-year stress memory, 82% of the gaps between collapses are exactly the 50-year minimum the model allows. We did not pre-register this check; we added it after seeing the result. Resetting the memory to calm instead ends that chaining, and settings that collapse fall from 330 to 258.

So "the tax share is the lever" restates one parameter ratio, and in this model elite overproduction, the mechanism at the centre of Turchin's theory, cannot cause a collapse: each collapse halves the elites and unrest keeps killing them, so they are below their equilibrium number whenever another collapse could fire. The next step is an elite term that can overshoot. All parameters are swept rather than measured, the model is deterministic, and nothing here describes a real state. The pre-registered hypotheses (two held, two refuted, one identity confirmed) are in the [research log](/research/civ-levers/).
