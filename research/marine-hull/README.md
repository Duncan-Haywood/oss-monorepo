# Which body carries a survey payload furthest per kWh? Hull choice for small autonomous boats

**Status: open research programme (proposal stage), milestones 1 and 2 done.** A stdlib resistance and
range calculator for small displacement survey boats (`src/marine_hull/`, 9 tests) and a first
sweep: at equal displacement, a catamaran out-ranges a monohull in only **0.4% of 6,561 swept
cases and in none at equal length**, because friction (wetted area) sets drag at survey speed
below 1 m/s and hotel load fixes the best speed near 1 m/s. Milestone 2 replaces the placeholder wave term with Michell thin-ship theory: the catamaran
wins **3.3%** of 6,561 cases, still none at equal length, and wave resistance moves best range by
only 4%. Milestone 5 adds a hydrofoil rung: in 2,916 swept cases a foilborne 200 kg craft never out-ranges the monohull (best case about a quarter of its range; foil coefficients swept, not sourced). Preliminary: Michell is checked against one published Wigley tank point only (milestone 3a: with no form factor the model is within a few per cent; at the central k = 0.25 it is about 20% high). Milestone 3b checks the placeholder wave term against five tank speeds of a published 2.8 m catamaran (Zenodo 18459868, CC BY 4.0): it is 35 to 43% low at Fn 0.33 to 0.58 and no single wave scale keeps all five within 20%, so it is not safe above Fn 0.3 (the programme's survey speeds are below that). See [`PROPOSAL.md`](PROPOSAL.md) and
[`LOG.md`](LOG.md).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/marine-hull/

**Programme.** Track 23 (`marine`, autonomous water vehicles) in [`../PROJECTS.md`](../PROJECTS.md).
Related labs: the repository's robotics and autonomy groups (ARPG, RECUV) for field vehicles; no
lab has reviewed this.

## Method and reproduce

```bash
cd research/marine-hull
PYTHONPATH=src python3 -m pytest tests -q          # 45 tests
PYTHONPATH=src python3 experiments/run_solar.py > experiments/results_solar.txt   # milestone 5c, 5 s
PYTHONPATH=src python3 experiments/run_solar_mass.py > experiments/results_solar_mass.txt   # milestone 5d, 10 s
PYTHONPATH=src python3 experiments/run_solar_sites.py > experiments/results_solar_sites.txt   # milestone 5e, 1 s
PYTHONPATH=src python3 experiments/run_solar_policy_bound.py > experiments/results_solar_policy_bound.txt   # milestone 5h, 3 s
PYTHONPATH=src python3 experiments/run_solar_surge_holdout.py > experiments/results_solar_surge_holdout.txt   # milestone 5i
PYTHONPATH=src:experiments python3 experiments/run_foil.py > experiments/results_foil.txt   # milestone 5
PYTHONPATH=src:experiments python3 experiments/run_swath.py > experiments/results_swath.txt   # milestone 5b, 25 s
PYTHONPATH=src python3 experiments/run_michell.py > experiments/results_michell.txt   # milestone 2, 2 s
PYTHONPATH=src python3 experiments/run_wigley_tank.py > experiments/results_wigley_tank.txt   # milestone 3a, 1 s
PYTHONPATH=src python3 experiments/run_catamaran_tank.py > experiments/results_catamaran_tank.txt   # milestone 3b, 1 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
PYTHONPATH=src python3 experiments/run_glider.py > experiments/results_glider.txt   # milestone 4, 1 s
PYTHONPATH=src python3 experiments/run_slocum.py > experiments/results_slocum.txt   # milestone 4b, 1 s
PYTHONPATH=src:experiments python3 experiments/run_remus.py > experiments/results_remus.txt   # milestone 4c, 1 s
PYTHONPATH=src:experiments python3 experiments/run_value.py > experiments/results_value.txt   # milestone 4e, 1 s
PYTHONPATH=src:experiments python3 experiments/run_current.py > experiments/results_current.txt   # milestone 4f, 1 s
```

`hull.py`: ITTC 1957 friction line (checked analytically: Cf = 0.003 at Re = 1e7), form factor,
wetted area S = c_s sqrt(V L), a placeholder wave term, propulsive and motor efficiency, hotel
load. Craft: 200 kg, 25% battery. Results: [`experiments/results.txt`](experiments/results.txt).

`michell.py` (milestone 2): Michell (1898) thin-ship wave resistance of Wigley hulls (closed-form
x and z integrals, checked against Simpson sums) with Havelock's two-hull interference factor.
`experiments/run_michell.py` swaps it in for the placeholder and uses the exact Wigley wetted area.
Results: [`experiments/results_michell.txt`](experiments/results_michell.txt).

`glider.py` (milestone 4): quasi-steady buoyancy glider (force balance, best-glide incidence, pump work
B tan(gamma)/(2 eta), independent of depth) against a same-mass propeller AUV. No glider coefficient is
sourced (the cited papers were unreachable); all are swept. Results: [`experiments/results_glider.txt`](experiments/results_glider.txt).

`solar.py` (milestone 5c): daily-mean deck solar (area x efficiency x derate x insolation, all swept) against the monohull's load. Energy-neutral at 1 m/s in 25% of 4,374 cases (0% at 3 m, 20% at 4 m, 56% at 5 m hull length); no case sustains 2 m/s; otherwise solar doubles range (median). Results: [`experiments/results_solar.txt`](experiments/results_solar.txt).

Milestone 5e replaces the swept insolation with NASA POWER monthly climatology (25-year all-sky horizontal means) at five sites, 0 to 60 degrees latitude. The 5 m central boat holds 1 m/s on deck solar in all 12 months at the equator and at 25 N, in 7 at 42 N and in 5 at 60 N; the 4 m boat in 7, 6, 4 and 0. An annual-mean verdict overstates year-round neutrality wherever winter insolation collapses (Gulf of Maine: 161 W/m2 annual, 53 in December). Results: [`experiments/results_solar_sites.txt`](experiments/results_solar_sites.txt); data as fetched: `experiments/data/`.

`experiments/run_slocum.py` (milestone 4b): the same glider model with Slocum aerodynamics read from the
MIT-licensed `gliderflight` package (PyPI 1.2.1; Merckelbach's implementation of the Slocum flight model):
S = 0.1 m^2, lift slope 7.5 /rad, K = 10.5 /rad^2, Cd0 0.15 to 0.31. Hotel load, pump efficiency and dive
energy stay swept. Results: [`experiments/results_slocum.txt`](experiments/results_slocum.txt).

`experiments/run_remus.py` (milestone 4c): a REMUS-100-class AUV (38.6 kg, 1.85 m, 0.19 m; vendor figures: 1.5 kWh,
12 h at 1.5 m/s or 8 h at 3 kn) whose non-propulsion load is the vendor's total power minus the model's propulsion
power. Results: [`experiments/results_remus.txt`](experiments/results_remus.txt).

`experiments/run_time.py` (milestone 4d): energy-delay product of the 4b glider cases against 4c's REMUS-class AUV
cases. Results: [`experiments/results_time.txt`](experiments/results_time.txt).

## Results (preliminary)

- Milestone 5b (SWATH: two submerged parabolic torpedoes on Wigley-form struts, Michell wave drag for both, 4,374 pairs against the 4 m monohull): the SWATH out-ranges the monohull in none, at its best speed (range ratio median 0.69, best 0.83) and at a fixed 3 m/s (median 0.46), because strut wave drag and wetted area outweigh the torpedoes' small wave drag at 200 kg. Wave drag of the torpedo falls with depth at about 2 k0 as theory says; no SWATH tank curve was reachable, so the absolute wave level is unvalidated. Stability and seakeeping, the reasons to build a SWATH, are not modelled.
- Milestone 4e (break-even value of time, same 14,580 pairs): the glider and the AUV tie when a day of delay is worth a median 0.37 kWh (10th to 90th 0.17 to 0.72), about 8% of the AUV's own daily energy use. No ship day rate could be sourced (hosts unreachable), so the exchange rate is the output, not an input.
- Milestone 4f (steady cross-current, swept 0 to 0.5 m/s, same 810 x 18 cases): the glider's energy win is lost by stalling, not gradually. It beats the AUV in 97% of pairs at 0.10 m/s, 50% at 0.20 m/s (about its median glide speed, 0.21 m/s) and none from 0.45 m/s; among gliders that can hold the track it stays above 90% at every current. Currents are swept, not sourced.
- Milestone 4d (time penalty, 14,580 pairs): the glider takes a median 5.5 days per 100 km against the AUV's
  12 h. The AUV has the lower energy-delay product in 78% of pairs; the glider's energy win holds only while delay
  is weighted below about 0.7 of energy. Two predictions refuted (see `LOG.md`). The AUV's best speed sits at the
  datasheet maximum, so this is a bound; the time-energy exchange rate is not sourced.

- Milestone 4c (REMUS-class AUV, hotel implied by vendor endurance): total power 125 to 188 W at 1.5 m/s, model
  propulsion 13 to 21 W, so the implied non-propulsion load is 104 to 175 W, 21 to 250 times the glider's swept
  0.7 to 5 W. The glider has the longer best range in 100% of 810 glider cases against all 18 AUV cases (median
  AUV/glider energy ratio 5.4). 4b's "decided by the power budgets" becomes "the glider wins on energy per metre
  unless the AUV's non-propulsion load is under about 5 to 24 W". Energy per metre is not time: the glider moves at
  0.2 m/s. Vendor figures are marketing and disagree with each other; the glider side is still swept.


- Milestone 4b (Slocum coefficients from `gliderflight`, 2,430 cases): at equal hotel load the glider has the
  longer best range in 0 cases (median AUV/glider energy ratio 0.36); the break-even AUV hotel load is a median
  4.9 times the glider's (10th to 90th 2.4 to 10.7), and the glider wins in 52% of cases at 5 times and 99.9% at
  20 times. The hotel-load reading of milestone 4 survives sourced aerodynamics; the measured hotel loads of a
  fielded glider and AUV are still the missing inputs.

- Milestone 4 (glider vs AUV, 52 kg, 19,683 swept cases, battery cancels): with the same hotel load the
  glider has the longer best range in only 5.9% of cases; it wins when the AUV's hotel load is 5 times the
  glider's (89%) or 20 times (100%). So the glider advantage is a hotel-load advantage, not a hydrodynamic
  one. The glider's horizontal speed tops out at 0.13 to 0.70 m/s (median 0.30) with a 10 N pump, so "glider
  loses above 1 m/s" is a capability limit, and H4's 0.4 to 0.9 m/s crossover is not supported (45 of 19,683
  cases). Not checked against a published glider range figure.

- Milestone 2 (Michell wave term, Wigley hulls): catamaran wins 216 of 6,561 cases (3.3%), none of
  729 equal-length cases at wave scale 0.5, 1, 1.5; median range ratio 0.87. Wave resistance is
  under 10% of viscous at the best-range speed (about 1 m/s, Fr 0.16) in 81.5% of cases; scaling
  it from 0 to 1.5 changes a 4 m monohull's range by 4%. Spacing barely matters at these speeds.
  Wave resistance is not validated against a tank curve.

- Catamaran wins 27 of 6,561 cases; median range ratio cat/mono 0.85 (0.72 to 1.02).
- Monohull range 560 to 1,188 km (upper bound: no waves, current, turns, reserve); best speed about 1 m/s.

- Deck-solar boat (milestone 5j, `experiments/run_solar_hull_uncertainty.py`): over 27 hulls in the milestone-1 box the best constant speed moves by 0.2 to 0.3 m/s, and running the central hull's best speed on another hull costs up to 9.1% of km/day (3 of 10 site-boat cases at 5% or more). Absolute km/day at the best speed spans about +-10% across the box (5 m Equator 109 to 133). Hull constants matter more than the surge rule of 5i (under 3%).
- Deck-solar sensitivity (milestone 5k, `experiments/run_solar_sensitivity.py`): one-at-a-time swings of six inputs over ranges I chose, not measured. Hotel load (19 to 50% of km/day), panel efficiency (16 to 30%) and derate (12 to 23%) move km/day 2 to 5 times more than the hull constants c_s and k_form (8 to 9%); the wave scale moves it 0.3 to 1.2%. Every input shifts the best speed by only 0.0 to 0.2 m/s. Source the hotel load and panel yield before the hull.
- Deck-solar joint interval (milestone 5m, `experiments/run_solar_mc.py`): drawing hotel load (5 to 20 W), panel efficiency (0.17 to 0.22) and three derate factors jointly (500 seeded draws, ranges partly my choices) gives 5 m km/day of about 133 / 125 / 97 / 77 / 69 (Equator, Florida, Gulf of Maine, North Sea, Gulf of Alaska), each within about -10/+9% (5% to 95%); the site ordering holds in 500 of 500 draws. It excludes the hull-constant uncertainty (5j, about +-10% more).

## Limitations

Seawater properties, efficiencies, form factors and wave term are unsourced or swept; no published
resistance curve has been reproduced yet (Michell's absolute level is unchecked); stability, deck area and payload are not
modelled. Simulation only: nothing here has been built or tested in water. Any real operation needs
the flag state's and local authority's rules (COLREGs, harbour master, permits).

## Next steps

Milestone 3 (Holtrop-Mennen against tank data) and milestones 5 to 7 in the proposal; the measured hotel load of a fielded glider and AUV is the number milestone 4 needs most. AI-assisted (Claude Code).
