# Research log: marine-dock

## 2026-11-10 · Milestone 1: docking capture rate (hypotheses written before the sweep)
- H1: pursuit and plain LOS capture under 50% at 0.3 m/s current, perfect position. H2: ILOS captures at least 90% with perfect position at 1.0 m/s. H3: at 0.5 m noise ILOS falls below 60%.
- Outcome: H1 held (0%). H2 held (98 to 100%). H3 held (55 to 62%). Unpredicted: a slow near-dock speed fails by crab angle (0.5 m/s needs 36.9 degrees at 0.3 m/s current), and ILOS is worse than LOS in still water under correlated noise (75 against 98% at 0.25 m).
- First run: gain 1.0 and a 15 degree gate gave 35% in still water; retuned on seeds 1000 to 1019 (gain 0.5, 30 degrees), reported on seeds 0 to 59.
