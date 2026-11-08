---
title: "Checking the densities behind battery volume ceilings: the ranking holds"
seo_title: "Checking the densities behind battery volume ceilings"
date: 2026-11-07
description: "Eight reactant densities behind battery Wh/L ceilings match PubChem's handbook records; FePO4 is 6.5% off and moves LiFePO4 by 3.8%. The ranking holds."
tags: [research, energy, batteries]
---

The `energy-volumetric` project ranks storage chemistries by watt-hours per litre of reactants, and it started with every density typed from memory. This run checked them against PubChem's Density records (HSDB, CRC and NIOSH excerpts).

Lead, lead dioxide, 100% sulfuric acid, water, lithium, sulfur, zinc and aluminium all agree with the sourced range to within 0.5%. Setting each of those to the low or high end of its range moves no couple by more than 1%, and the ranking (zinc-air, Li-O2, Al-air, Li-S, graphite/LiCoO2, hydrogen at 700 bar, LiFePO4, lead-acid) does not change.

One value disagrees. PubChem gives FePO4 as 2.87 g/cm3, against the 3.07 I used. With 2.87, LiFePO4 drops from 1,040 to about 1,000 Wh/L. I could not tell which polymorph that record describes. Graphite LiC6, half-delithiated LiCoO2 and the cryogenic liquids have no record there, so they are still assumed.

The script re-queries PubChem with one command and otherwise runs offline from the committed records. Details are in the project README.
