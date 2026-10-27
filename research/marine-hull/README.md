# Which body carries a survey payload furthest per kWh? Hull choice for small autonomous boats

**Status: open research programme (proposal stage), milestones 1 and 2 done.** A stdlib resistance and
range calculator for small displacement survey boats (`src/marine_hull/`, 9 tests) and a first
sweep: at equal displacement, a catamaran out-ranges a monohull in only **0.4% of 6,561 swept
cases and in none at equal length**, because friction (wetted area) sets drag at survey speed
below 1 m/s and hotel load fixes the best speed near 1 m/s. Milestone 2 replaces the placeholder wave term with Michell thin-ship theory: the catamaran
wins **3.3%** of 6,561 cases, still none at equal length, and wave resistance moves best range by
only 4%. Preliminary: Michell is not yet checked against a published tank curve. See [`PROPOSAL.md`](PROPOSAL.md) and
[`LOG.md`](LOG.md).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/marine-hull/

**Programme.** Track 23 (`marine`, autonomous water vehicles) in [`../PROJECTS.md`](../PROJECTS.md).
Related labs: the repository's robotics and autonomy groups (ARPG, RECUV) for field vehicles; no
lab has reviewed this.

## Method and reproduce

```bash
cd research/marine-hull
PYTHONPATH=src python3 -m pytest tests -q          # 27 tests
PYTHONPATH=src python3 experiments/run_michell.py > experiments/results_michell.txt   # milestone 2, 2 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
PYTHONPATH=src python3 experiments/run_glider.py > experiments/results_glider.txt   # milestone 4, 1 s
PYTHONPATH=src python3 experiments/run_slocum.py > experiments/results_slocum.txt   # milestone 4b, 1 s
(cd experiments && PYTHONPATH=../src python3 run_remus.py > results_remus.txt)   # milestone 4c, 5 s
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

`experiments/run_slocum.py` (milestone 4b): the same glider model with Slocum aerodynamics read from the
MIT-licensed `gliderflight` package (PyPI 1.2.1; Merckelbach's implementation of the Slocum flight model):
S = 0.1 m^2, lift slope 7.5 /rad, K = 10.5 /rad^2, Cd0 0.15 to 0.31. Hotel load, pump efficiency and dive
energy stay swept. Results: [`experiments/results_slocum.txt`](experiments/results_slocum.txt).

`experiments/run_remus.py` (milestone 4c): the glider against a REMUS 100M whose total power comes from the HII
datasheet (1.5 kWh; 10 h or 67 km at 1.5 m/s; 1.85 m, 0.19 m, 38.6 kg), with its hotel load inferred by subtracting
modelled propulsion. Glider hotel 0.5 to 5 W (Bruvik et al. 2020, doi:10.5194/os-16-291-2020). Results:
[`experiments/results_remus.txt`](experiments/results_remus.txt).

## Results (preliminary)

- Milestone 4c (REMUS 100M datasheet, 4,860 comparisons): the datasheet implies a REMUS hotel load of 57 to 132 W;
  the glider has the longer best range in all 4,860 comparisons (median AUV/glider energy per metre 5.4, minimum
  1.21). The AUV would tie at a median 6.8 W. With each platform's usual payload the glider wins, and the
  margin is the AUV's sensors and electronics; at equal hotel load it still loses (4b). The hotel split is
  inferred from a modelled drag, and the datasheet's 10 h and 67 km figures disagree, so both are used.

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

## Limitations

Seawater properties, efficiencies, form factors and wave term are unsourced or swept; no published
resistance curve has been reproduced yet (Michell's absolute level is unchecked); stability, deck area and payload are not
modelled. Simulation only: nothing here has been built or tested in water. Any real operation needs
the flag state's and local authority's rules (COLREGs, harbour master, permits).

## Next steps

Milestone 3 (Holtrop-Mennen against tank data) and milestones 5 to 7 in the proposal; the measured hotel load of a fielded glider and AUV is the number milestone 4 needs most. AI-assisted (Claude Code).
