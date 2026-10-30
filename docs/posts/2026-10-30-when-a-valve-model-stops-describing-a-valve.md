---
title: "When a valve sizing rule stops describing a valve"
seo_title: "Excavator valve model: when the sizing rule breaks, a bug vs a limit"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, excavator, modelling]
description: "Fixing a solver bracket in the open-centre excavator valve model removed one artefact and exposed a real validity limit."
---

Yesterday's `heavy-hydraulics` note blamed a strange row (bypass closing factor k = 20) on a solver bracket that stopped at 400 bar above the load pressure. I fixed the bracket so it grows until the sign changes, and predicted the row would drop to a 0% cycle-time penalty. It did not: the median penalty is 17.1% at k = 20 and 21.6% at k = 50 at the PVG 32 neutral drop (10.9 bar).

The cause is the model, not the solver. With k that large, each valve section is sized for a supply pressure above the 250 bar relief setting, so a real pump could not push the flow through. The usable range is roughly k up to 10 at 10.9 bar. The earlier reading stands inside it: if the bypass closes within the spool's dead band, the open-centre time penalty is small. Rows beyond are outside the model.

Next is sizing the sections from the manual's rated flows instead of from the closing law. Log and script: `research/heavy-hydraulics`, milestone 3e.
