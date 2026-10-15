# simdesign-loadbind: when does the buckling guard of the laser-cut bracket bind as load and arm length change?

Follow-up in the simulation-first design track (`PROJECTS.md`, track 5), taking the "sweep load and arm lengths to see when the guard starts to bind" next step of `simdesign-buckleguard`. Produced with AI assistance (Claude). A stylised 2D plane-stress model with a closed-form buckling check and assumed rule values, material and load; preliminary, nothing was made or tested. It builds on none of the CU Boulder groups in `prompt.md`.

**Builds on.** `simdesign-buckleguard` (the code, the bracket, the guard "governing lateral-torsional factor ≥ K" with K = 3 assumed, and the closed forms of Timoshenko and Gere, *Theory of Elastic Stability*, 2nd ed., 1961, whose page-level references are unchecked there too), `simdesign-dfm` and `simdesign-widerweb`. The only code change is that tip load F and both arm lengths are module settings (`dfm.LOAD_N`, `dfm.ARM_MM`) passed to the finite-element model and the buckling formulas; defaults reproduce `simdesign-buckleguard`.

## Method
Laser-cut steel sheet (stock gauges 1 to 12 mm, 1.2 mm minimum wall), minimum-mass design by differential evolution (popsize 6, maxiter 20, mesh h = 1.5 mm, peak von Mises ≤ 100 MPa, tip ≤ 4 mm), two seeds, for three guards: the old rule w/b ≤ 8, the buckling factor ≥ 3, and no out-of-plane rule. Cases (`experiments/sweep.py`): F = 50, 100, 200, 400 N at 80 mm arms, and arms of 60 and 120 mm at 100 N.

## Reproduce
```bash
pip install numpy scipy scikit-fem shapely matplotlib pytest
cd research/simdesign-loadbind
python -m pytest -q tests        # 11 tests, about a second
python experiments/sweep.py      # about 35 min on 4 cores; writes sweep.txt/json
```

## Results (from `experiments/sweep.txt`; best of two seeds)
| F (N) | arm (mm) | old rule w/b ≤ 8 (g) | buckling ≥ 3 (g) | no rule (g) | LTB factor of the unguarded optimum |
|---|---|---|---|---|---|
| 50 | 80 | 25.8 (2 mm) | 22.1 (1.5 mm) | 22.1 | 4.5 |
| 100 | 80 | 35.8 (2 mm) | 31.3 (1.5 mm) | 31.0 | 3.4–3.6 |
| 200 | 80 | 62.0 (3 mm) | 49.6 (2 mm) | 49.6 | 5.2 |
| 400 | 80 | 99.2 (4 mm) | 99.3 (4 mm)* | 99.2 | 20 |
| 100 | 60 | 22.2 (2 mm) | 19.4 (1.5 mm) | 19.4 | 5.3 |
| 100 | 120 | 83.6 (3 mm) | 68.9 (2 mm) | 59.2 (1.5 mm) | 1.9 |

\*One of the two seeds returned a 5 mm design of 111.5 g, worse than the 4 mm design the other found; this is search noise (a small budget, discrete gauges), not a guard effect.

- **The buckling guard did not bind in five of the six cases.** There the unguarded optimum already has a factor of at least 3.4, and the buckling-guard mass is within 1% of the unguarded mass. The stress and tip limits set the design.
- **It binds at 120 mm arms.** The unguarded 1.5 mm design has a factor of 1.9, so K = 3 forces the 2 mm gauge: 68.9 g against 59.2 g, 16% heavier than unguarded (but 18% lighter than the old rule's 83.6 g).
- **The old rule was the costly one everywhere except 400 N.** It was 14 to 25% heavier than the buckling guard in five cases (the old rule forces the next gauge up once w/b would exceed 8). At 400 N the stress limit already needs w ≈ 22.7 mm and a 4 mm gauge, w/b = 5.7, so neither rule matters.
- The mass steps with load are in part gauge steps (1.5, 2, 3, 4 mm stock), which is why mass is not smooth in F.

## Limitations
- Same as `simdesign-buckleguard`: closed-form buckling of ideal bars, no imperfections, residual stress, corner flexibility or plasticity; K = 3 is assumed, and a different K moves the binding point.
- Two seeds, one mesh, one material, a small search budget; infeasible or worse designs are search results, not proofs. Differences under about 1 g are within seed spread.
- Seven cases only; load and arm length were varied one at a time.
- Simulated (calculated) only; no claim about real sheet-metal parts.

## Next steps
Sweep K together with arm length to map the binding boundary directly (a 2D grid), or replace the closed form by a shell eigenbuckling model of the L-bracket as one body.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, shapely, matplotlib; pytest for tests). Rule values, material, loads and K are assumptions that real shop data would replace.
