# Proposal: which body carries a survey payload furthest per kWh, and does the ranking survive the uncertainty in how we price drag?

Programme `marine-hull`, opened 2026-10-27 as the first programme of track 23 (`marine`,
`research/PROJECTS.md`). Written with AI assistance (Claude Code). This is a plan plus one
first-order calculation; no tank, field or CFD result exists yet. References were written from
memory and then looked up; "Citation status" says which were machine-checked.

## Question

For a small autonomous survey craft (100 to 500 kg, 0.5 to 3 m/s survey speed), which body
(monohull, catamaran, SWATH, planing hull, hydrofoil, buoyancy glider, propeller AUV) gives the
longest range or the lowest energy per surveyed kilometre, and for which resistance-prediction
errors and hotel-load levels does that ranking flip?

Open because published comparisons fix one method and one vehicle; the ranking at survey speeds
depends on unsourced hull-form constants and on the payload's fixed power draw, and nobody reports
the region where the answer changes.

## Why it matters

Bathymetric and water-quality survey operators choose a platform once and live with it. Most
small USVs are catamarans or monohulls chosen for deck area and stability, not endurance. If hotel
load dominates at survey speed, hull choice matters less than payload power; if not, it matters
a lot. A calculator with an explicit "ranking survives / flips" map tells a buyer which input to
measure first.

## Related work

Resistance and propulsion of displacement hulls:
- Holtrop and Mennen, "An approximate power prediction method", *International Shipbuilding Progress* 29(335), 1982. The standard regression for displacement hulls; fitted to ships of tens of metres, so its validity at 3 m is an open question this programme tests.
- Molland, Turnock and Hudson, *Ship Resistance and Propulsion*, Cambridge University Press, 2011, doi:10.1017/CBO9780511974113. Textbook source for the ITTC 1957 line, form factors and catamaran interference.
- Insel and Molland, "An investigation into the resistance components of high speed displacement catamarans", *Transactions of the Royal Institution of Naval Architects* 134, 1992. Measured viscous and wave interference for catamarans; the source for the interference range swept here.
- ITTC (International Towing Tank Conference), recommended procedures on resistance and the 1957 correlation line, https://www.ittc.info/. The friction line used; also fixes the water properties.
- Savitsky, "Hydrodynamic design of planing hulls", *Marine Technology* 1(1), 1964. Planing-hull method for the high-speed rung; outside the 0.5 to 3 m/s range of milestone 1.
- Faltinsen, *Hydrodynamics of High-Speed Marine Vehicles*, Cambridge University Press, 2005, doi:10.1017/CBO9780511546068. SWATH, hydrofoil and planing theory in one source.

Dynamics and the vehicle landscape:
- Fossen, *Handbook of Marine Craft Hydrodynamics and Motion Control*, Wiley, 2011, doi:10.1002/9781119994138. Models for later control milestones.
- Manley, "Unmanned surface vehicles, 15 years of development", OCEANS 2008, doi:10.1109/OCEANS.2008.5289429. Survey of USV hull types; qualitative.
- Liu et al., "Unmanned surface vehicles: an overview of developments and challenges", *Annual Reviews in Control* 41, 2016, doi:10.1016/j.arcontrol.2016.04.018. Catalogues vehicles and hulls; no common energy basis.
- Wynn et al., "Autonomous Underwater Vehicles (AUVs): their past, present and future contributions to the advancement of marine geoscience", *Marine Geology* 352, 2014, doi:10.1016/j.margeo.2014.03.012. Survey AUV capability and endurance figures to calibrate against.
- Rudnick, Davis, Eriksen, Fratantoni and Perry, "Underwater gliders for ocean research", *Marine Technology Society Journal* 38(2), 2004 (not machine-checked; the DOI first written for it resolved to another paper). The later review Rudnick, "Ocean research enabled by underwater gliders", *Annual Review of Marine Science* 8, 2016, doi:10.1146/annurev-marine-122414-033913, is checked. Glider range and speed figures that milestone 4 reproduces.
- Eriksen et al., "Seaglider: a long-range autonomous underwater vehicle for oceanographic research", *IEEE Journal of Oceanic Engineering* 26(4), 2001, doi:10.1109/48.972073. A fielded glider with published range and energy; the reference point for H4.
- Bingham et al., "The Virtual RobotX simulator", OCEANS 2019, https://github.com/osrf/vrx. Open Gazebo marine simulation for later control and sim-to-real work.

## Gap

Prior work gives resistance methods and vehicle catalogues. Missing, and narrow enough to check:
a **common energy-per-survey-kilometre comparison of hull types at 100 to 500 kg, with an
explicit sensitivity map** (hull-form constants, form factor, interference, wave term, battery
specific energy, hotel load) stating where the ranking flips, and a check of regression methods
(Holtrop-Mennen) at the small scale where they were not fitted. Our `osrobot-*` and `codesign-*`
projects size robots but not hulls; none compares water vehicles.

## Hypotheses

- **H1 (hotel load).** At 30 W payload load and survey speed up to 1 m/s, the best-range speed of a displacement monohull is set by the hotel load, not the hull, and range changes by under 10% between hull-form constants within the swept box. Refuted if range varies by 10% or more.
- **H2 (catamaran).** At equal total displacement and equal length, a catamaran never out-ranges a monohull at survey speed (more wetted area, no wave benefit below Froude number 0.3). Refuted if any equal-length case with a sourced interference factor favours the catamaran.
- **H3 (small-scale regression).** Holtrop-Mennen resistance at 3 to 5 m length differs from tank-test resistance of published small hulls by more than 20%. Refuted if within 20% on every published small-hull case found.
- **H4 (glider).** A buoyancy glider out-ranges a same-mass, same-battery propeller AUV at 0.25 m/s but not above 1 m/s. Refuted if the crossover lies outside 0.4 to 0.9 m/s on published figures.
- **H5 (flip map).** The ranking of hull types changes within the sourced range of battery specific energy (150 to 250 Wh/kg). Refuted if no pair swaps rank.

## Method

Theory: closed-form comparison of friction-dominated and hotel-dominated regimes (best-range
speed where marginal drag power equals marginal hotel power per unit speed). Experiments:
(1) ITTC 1957 plus form factor calculator, deterministic grid over unsourced constants (`src/`,
`experiments/run.py`: done); (2) a wave-resistance term from a published curve (Wigley hull,
Michell thin-ship theory) checked against tank data; (3) Holtrop-Mennen against published
small-hull tests (H3); (4) glider and AUV models against published range figures (H4); (5)
sourced battery energy density (track 16, `energy-density`).

## Evaluation

Baselines: ITTC 1957 friction only, and Holtrop-Mennen. Measured data: published resistance
curves and the range figures of fielded vehicles. Metrics: range at best speed, energy per
kilometre, relative error against tank data. Sweeps are deterministic grids reporting the share
of cases in which each conclusion holds; statistics (bootstrap intervals) apply to any
empirical-data comparison.

## Milestones

1. Calculator and first sweep (this session): `src/`, 9 tests, `experiments/run.py`.
2. Replace the placeholder wave term by a sourced curve; reproduce a published resistance curve (H2 with sourced inputs).
3. Holtrop-Mennen against small-hull tank data (H3).
4. Glider against propeller AUV (H4; track milestone `marine-glider`).
5. Hydrofoil, SWATH and planing rungs; battery and solar from `energy-density` (H5).
6. Survey-line control and sea states (`marine-path`), fleet comparison.
7. Paper draft in the venue's format.

## Target venue

OCEANS (IEEE/MTS) conference paper, 6 to 10 pages, or *Ocean Engineering* / *IEEE Journal of
Oceanic Engineering* for the full study. An aim, not a claim of acceptance.

## Citation status

DOI-bearing entries were checked with `research/_shared/cite_check.py`; the results are in
`LOG.md`. Entries without a DOI (Holtrop and Mennen, Insel and Molland, ITTC, Savitsky, Rudnick 2004, the VRX
repository) were not machine-checked and must be opened before use in a paper.
