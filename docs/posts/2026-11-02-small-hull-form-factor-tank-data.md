---
title: "Tank data says small hulls have far less form drag than the textbook formula"
seo_title: "Hull form factor from Delft yacht series tank data vs Holtrop-Mennen"
date: 2026-11-02
tags: [research, marine-hull, naval-architecture, hydrodynamics]
description: "At slow speeds the Delft yacht-series tank points imply a form factor around 0.06, a third to a fifth of what Holtrop-Mennen predicts."
---

Our marine-hull research programme asks which hull type carries a small survey boat furthest per kWh. A recurring input is the *form factor* k, the extra viscous drag a real hull has over a flat plate.

Using 308 public tank points from the Delft Systematic Yacht Hull Series (22 hulls), we took the lowest Froude number, 0.125, where wave making is smallest. There the residuary resistance divided by the friction resistance is an upper bound on k. The median is 0.06 (10th to 90th percentile 0.03 to 0.13). Holtrop-Mennen's own k1 for the same hulls is 0.29 to 0.36, and our central assumption was 0.25. The bound is below both for all 22 hulls.

Caveats: these are keeled sailing yachts, the wetted area comes from the Holtrop-Mennen regression, and the data file is a public mirror we could only check structurally. The result suggests our range and ranking sweeps were conservative about form drag for slender hulls. The next step re-runs them with k from 0.03 to 0.15.

Code and log: `research/marine-hull/experiments/run_yacht_formfactor.py`, LOG milestone 3i.

## Update: does it change the catamaran verdict?

Rerunning the programme's 6,561-case hull comparison with form factors from 0.03 to 0.15 (the tank bound) leaves the catamaran winning 0 cases. The older, higher-k box gave 27 (0.4%), all from pairing a high-drag monohull with a low-drag catamaran. Lower form factors help both hulls about equally, so the hull ranking does not move. The bound comes from keeled yachts only; a keel-less survey-hull table is the next thing to find (`research/marine-hull/LOG.md`, milestones 3j and 7k).
