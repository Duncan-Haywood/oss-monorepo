# garment-markercost: what do seam allowance and mixed sizes do to marker efficiency, and what does that do to a garment's cloth cost?

Follow-up to `garment-nesting` and `garment-teardown` (track 6, `PROJECTS.md`; the "Next steps" of both). `garment-teardown` assumed a fixed marker efficiency of 0.78 to 0.80. `garment-nesting` measured efficiencies for stylised pieces with **no seam allowance**. Here I add a 1 to 1.5 cm seam allowance to the pieces, nest three shirt sizes in one marker, and swap the measured efficiencies into the teardown formula as a sensitivity check. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-markercost/

**Builds on.** The nesting and cost code of the two sibling projects (imported, not copied, except for the two stylised garment outlines, which come from `garment-nesting/experiments/run.py`); the nesting framing of Bennell and Oliveira (2008). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method (`src/garment_markercost/model.py`)
- `offset_polygon`: grows a simple polygon outward by the seam allowance with mitred corners (corner extension capped at 2x the allowance). It is not a general polygon buffer.
- `marker`: best of 3 annealing seeds (120 decodes each) of `garment_nesting.raster.anneal_raster` over the *cut* pieces (pattern plus allowance), 2 cm raster, 180-degree turns only.
- `efficiency` = finished-pattern area / (fabric width x marker length), so allowance counts as cloth used, not as covered.
- Experiment A: shirt (9 pieces) and four-gore skirt (5 pieces) at 140 cm width, allowance 0, 1 and 1.5 cm. B: three shirts scaled 0.94, 1.00, 1.06 (linear) nested in one marker versus three markers, 1 cm allowance. C: teardown's shell-fabric cost (`fabric_cost_per_garment`) for the trench and coat with the measured efficiencies swapped in.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/garment-markercost
python -m pytest -q tests                                                   # 6 tests
PYTHONPATH=src:../garment-nesting/src:../garment-teardown/src python experiments/run.py   # about 1 minute
```

## Results (from `experiments/results.txt`, one seeded run)
| garment | allowance | marker (cm) | efficiency |
|---|---|---|---|
| shirt | 0 | 124 | 0.692 |
| shirt | 1.0 cm | 136 | 0.631 |
| shirt | 1.5 cm | 134 | 0.640 |
| skirt | 0 | 82 | 0.707 |
| skirt | 1.0 cm | 114 | 0.508 |
| skirt | 1.5 cm | 118 | 0.491 |

- A 1 cm allowance cost the shirt about 10% more marker length, and the skirt 39% more: with no allowance the trapezoidal gores interlock tightly on the 2 cm raster; with the allowance they did not in my search. The skirt number is largely that interlock being lost, not a smooth effect of 1 cm of cloth.
- The shirt got slightly *better* from 1.0 to 1.5 cm (136 to 134 cm). That is search noise (few decodes, three seeds) and a 2 cm raster, not a real effect; treat differences of a few cm as noise.
- Mixed sizes (B): three separate markers total 402 cm (efficiency 0.642); one combined marker is 366 cm (0.705), 9.0% shorter. One run, one scaling scheme; real size runs depend on the order mix.
- Cost (C), shell fabric only, `garment-teardown` areas and prices (all assumed there): at $7/m^2 the trench's cloth is $26.14 at the assumed 0.80 efficiency, $33.14 at the shirt's 0.631 and $41.14 at the skirt's 0.508. At $28/m^2 the same swap moves it from $104.54 to $132.57 and $164.55. Cloth cost scales as 1/efficiency, so the cost of a 0.10 fall in efficiency grows with cloth price.

## Limitations
- **Stylised.** Invented outlines, one ply, no notches, no grain-matching, no defects. The coats of `garment-teardown` were not nested; Experiment C applies the *shirt's and skirt's* efficiencies to them as a sensitivity, not as a measurement of coat cloth use. Real coats have much larger, more awkward pieces.
- Offset by mitred vertices, not a true buffer; the raster is conservative and rounds lengths to 2 cm.
- Annealing uses a small budget and no exact reference exists for polygon markers, so efficiencies are lower bounds on what a good marker maker would reach. Whether the 0.78 to 0.80 assumption is high or low for real coats is **not** settled by this project.
- Single seeds per configuration group; no confidence intervals.

## Next steps
Real pattern pieces (FreeSewing, under its license; or `garment-pattern-fit` output), mirroring of left and right pieces, a proper polygon buffer, more decodes and an exact reference on very small polygon markers, and a cut-ply and cutter-time term.

## Owner steps
None required. Cutting a real marker and weighing the cloth is an owner step if these numbers are to be checked.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest. The garment shapes, cloth prices and the teardown assumptions come from outside the model.

## References
- Bennell, J. A., Oliveira, J. F. (2008). The geometry of nesting problems: A tutorial. *Eur. J. Oper. Res.* 184(2):397-415. https://doi.org/10.1016/j.ejor.2006.11.038  (listed in `PROJECTS.md` References, checked 2026-10-12; not re-read in full)
- `research/garment-nesting` and `research/garment-teardown` in this repository (their own README lists their sources).
