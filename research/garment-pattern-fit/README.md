# garment-pattern-fit: can a cheap drape simulation score pattern fit, and is a fitted pattern body-specific? (stylised)

Second milestone of the engineered-clothing track (`PROJECTS.md`, track 6). A flat trapezoid skirt-tube pattern (waist and hem circumference, length) is draped in simulation on an elliptical-section body; fit is scored by strain and waist ease; the pattern is then optimised for each of two synthetic bodies and swapped between them. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-pattern-fit/

**Builds on.** Position based dynamics for cloth: Müller, Heidelberger, Hennix and Ratcliff (2007), *J. Vis. Commun. Image Represent.* 18(2):109–118. Cloth simulation for garments: Baraff and Witkin (1998), "Large steps in cloth simulation", SIGGRAPH, <https://doi.org/10.1145/280814.280821> (cited as context; this project does **not** implement their method). Ramanujan's (1914) ellipse-perimeter approximation, *Quart. J. Pure Appl. Math.* 45:350–372. I wrote the cloth code myself from the PBD idea; no third-party cloth or pattern code is used. FreeSewing patterns are **not** used here (the track mentions them; this milestone uses my own pattern). Citations were written from memory and `PROJECTS.md`; I could not open the papers in this run, so check them before relying on them. It builds on none of the CU Boulder groups in `prompt.md`, and claims no connection to them.

## Method
- `src/garment_pattern_fit/model.py`: `Body` (stack of ellipses from waist to upper thigh), `Pattern` (waist, hem, length), `simulate` (PBD: structural, shear and skip-one bending distance constraints from the flat pattern; gravity; ellipse collision with 4 mm thickness; contact friction; the waistband row has its height held, radius free), `metrics`, `cost`.
- Metrics: p95 of |circumferential strain|; waist ease = simulated top-ring perimeter / body perimeter − 1; hem standoff from the body.
- Cost = strain_p95/5% + (distance of waist ease outside the free band 0 to 4%)/4%. **Weights and tolerance are my assumptions**, not a fit standard.
- Two synthetic bodies: A (hip/waist perimeter 1.16, waist-to-hip step) and B (1.02, straight).
- Search: 6×6 grid of waist ratio × hem ratio, then coordinate refinement.

## Reproduce
```bash
pip install numpy pytest
cd research/garment-pattern-fit
python -m pytest -q tests                      # 8 tests, a few seconds
PYTHONPATH=src python experiments/run.py       # writes experiments/results.txt (~5 min on one CPU)
```

## Results (from `experiments/results.txt`; stylised)
| | body A (step) | body B (straight) |
|---|---|---|
| optimal waist / body waist perimeter | 1.008 | 1.031 |
| optimal hem / body hip perimeter | 1.46 (edge of searched range) | 1.02 |
| strain p95 at optimum | 2.8% | 0.7% |
| cost at own optimum | 0.75 | 0.15 |
| cost of the *other* body's pattern | 2.87 | 2.09 |

- The best waist pattern sits just above the body's waist perimeter for both bodies: tighter patterns strain, looser ones leave waist ease (a ring that would need a belt or elastic). The cost grid shows this tradeoff in both bodies.
- A pattern optimised for one synthetic body fits the other clearly worse (regret +1.94 and +2.12 in cost units), in this toy. The cost units are arbitrary, so only the ordering is meaningful.
- Body A's hem optimum is at the edge of the searched range: the cost has no hem term, so a wider flare only relieves strain. Treat the hem value as an artefact of the cost, not a design result.
- Cost weights (four settings) did not change the best grid cell on body A.

## Limitations
- **Mesh and solver dependence.** The cost of the body-A optimum moves from 0.75 to 1.34 on a finer mesh (48×20 vs 36×16) and to 1.13 with 15 instead of 25 iterations (see results). PBD stiffness depends on iteration count and mesh, so strains are not material strains. No absolute number should be read as fit.
- Body is a stack of ellipses (one merged leg block), not a scan; no darts, seams, bust, shoulders, or body motion. Fabric stiffness, shear and bending are not measured or calibrated; fabric is a single idealised sheet.
- The waistband is held at waist height by construction, so sliding and the real role of the waist (belts, elastic, friction) are out of the model. An earlier unpinned version let the skirt slide off the body; I dropped it rather than tune friction.
- No comparison with a physical garment or any standard fit metric. A simulated fit is not a claim about a real fit.

## Next steps
Scan-derived or parametric body models, FreeSewing pattern import, a hem term and a proper seam/dart model, calibrated fabric parameters (e.g. Kawabata-style data), and a nesting step (`garment-nesting`).

## Owner steps
Sewing a muslin to compare with the simulation is an owner step, with fabric priced and dated at that time (not done or modelled here).

## Outside dependencies (vitamins)
Python, numpy. Real body measurements, fabric properties and any physical garment come from outside the model.
