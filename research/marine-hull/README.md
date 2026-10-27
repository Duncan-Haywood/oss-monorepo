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
PYTHONPATH=src python3 -m pytest tests -q          # 15 tests
PYTHONPATH=src python3 experiments/run_michell.py > experiments/results_michell.txt   # milestone 2, 2 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
```

`hull.py`: ITTC 1957 friction line (checked analytically: Cf = 0.003 at Re = 1e7), form factor,
wetted area S = c_s sqrt(V L), a placeholder wave term, propulsive and motor efficiency, hotel
load. Craft: 200 kg, 25% battery. Results: [`experiments/results.txt`](experiments/results.txt).

`michell.py` (milestone 2): Michell (1898) thin-ship wave resistance of Wigley hulls (closed-form
x and z integrals, checked against Simpson sums) with Havelock's two-hull interference factor.
`experiments/run_michell.py` swaps it in for the placeholder and uses the exact Wigley wetted area.
Results: [`experiments/results_michell.txt`](experiments/results_michell.txt).

## Results (preliminary)

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

Milestones 2 to 7 in the proposal. AI-assisted (Claude Code).
