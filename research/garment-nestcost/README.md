# garment-nestcost: what does a nested marker do to the cost of a coat, and how far is `garment-teardown`'s fixed 0.80 from it?

Follow-up to `garment-nesting` and `garment-teardown` (track 6, `PROJECTS.md`): the "feed the measured efficiency back into `garment-teardown`" step. I draw a stylised lined coat as polygons (10 shell pieces, 5 lining pieces), grow each piece by a 1.5 cm seam allowance, nest them with the `garment-nesting` raster annealer at three cloth widths, and put the measured marker efficiencies into `garment-teardown`'s cost chain. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-nestcost/

**Builds on.** `garment-nesting` (raster polygon nesting, annealing over order and 180-degree turns; its references: Bennell and Oliveira 2008, Baker, Coffman and Rivest 1980, Kirkpatrick, Gelatt and Vecchi 1983) and `garment-teardown` (the cost chain). `garment-markercost` already measured the effect of seam allowance and size mixing on a shirt and a skirt; this project differs in using a coat-like piece set and in reading off cost per width. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `src/garment_nestcost/coat.py`: my own pieces (back, two fronts, two sleeves, collar, storm flap, a 160 cm belt, two pockets; lining back, two fronts, two sleeves), grain along y, one size. `offset_polygon` grows a piece by a mitred offset (miter capped at 2x the allowance); it is checked on a square in the tests.
- `experiments/run.py`: for fabric widths 110, 140 and 150 cm, allowance 0 and 1.5 cm, shell and lining separately, 150 annealing decodes, best of 5 seeds; efficiency = net piece area / (width x marker length), which is what `garment-teardown` calls `marker_efficiency`. Every marker is asserted overlap-free.
- `src/garment_nestcost/cost.py`: `cost_with_markers` is `garment-teardown`'s chain with separate shell and lining efficiencies; a test confirms it equals `cost_breakdown` when both are equal.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/garment-nestcost
python -m pytest -q tests                      # 6 tests
PYTHONPATH=src python experiments/run.py       # about 95 s; writes experiments/results.txt
```
The project imports the sibling projects `garment-nesting` and `garment-teardown` by relative path, so keep the three under the same `research/` directory.

## Results (from `experiments/results.txt`; one seeded run)
My piece set has 1.970 m^2 of shell and 1.455 m^2 of lining, against the 2.9 and 2.2 m^2 that `garment-teardown` assumed for its trench coat. The pieces differ (mine omit yokes, gussets, epaulettes, cuffs and under-collar), so costs are shown both ways.

| part | width | efficiency, no allowance | efficiency, 1.5 cm allowance |
|---|---|---|---|
| shell | 110 cm | 0.786 | 0.717 |
| shell | 140 cm | 0.818 | 0.677 |
| shell | 150 cm | 0.773 | 0.730 |
| lining | 110 cm | 0.696 | 0.675 |
| lining | 140 cm | 0.658 | 0.626 |
| lining | 150 cm | 0.638 | 0.592 |

- With a 1.5 cm allowance the shell efficiency is 0.68 to 0.73 and the lining 0.59 to 0.68, all below the fixed 0.80 that `garment-teardown` used for both. Without allowance the shell is 0.77 to 0.82, so the fixed value is close to a no-allowance figure for this piece set, not a seam-allowance one.
- Shell cloth consumed at 1.5 cm allowance is 2.70 to 2.91 m^2 across the three widths (a spread of 7.9%); the narrowest cloth was not the cheapest in cloth area, and no width was best for both shell and lining. This assumes a constant price per m^2, whereas wider cloth often costs more per metre.
- **Cost, trench model, mid-wage scenario.** `garment-teardown` as published: FOB $204, model retail $989. With my areas and measured efficiencies: FOB $168 to $175 (-14% to -18%), because my areas are smaller. With `garment-teardown`'s own areas and the measured efficiencies transplanted: FOB $224 to $234 (+9% to +15%). So the efficiency assumption alone is worth about +$20 to +$30 of FOB, and the area assumption about -$55 to -$60; neither is measured against a real pattern.
- **Replica** (the $7/m^2 and $3/m^2 build at the mid-wage scenario): $46 to $50 with my areas and measured efficiencies, against $56 published. This is inside the $20 to $50 target only because my pieces are small; with the published 2.9/2.2 m^2 areas it would sit above it. The pattern area is the weak link, not the marker.
- A 160 cm belt sets a floor on the marker length at the wider cloths, so part of the width effect is one piece's geometry.

## Limitations
- **Stylised.** Pieces are my own shapes, not a real pattern; one ply, one size, no mirroring, no stripe matching, notches, pile or defects. The coat has no real-world measurement behind it.
- Annealing is small (150 decodes) and the raster is 2 cm and conservative; "best of 5 seeds" is an upper bound on the best marker, with no exact reference. Seed spreads are in `results.txt` (up to about 14 cm at 1.5 cm allowance).
- The mitred offset is not a true polygon buffer; it is exact on straight edges and approximate on the sampled curves.
- Cloth price per m^2 is held constant across widths. All cost inputs other than the marker are `garment-teardown`'s assumptions; the model's prices are not claims about any brand.
- Citations are inherited from `garment-nesting` and `garment-teardown`, where they were checked; I could not re-check them against Crossref in this run (outbound access to it was refused).

## Next steps
Real piece geometry (FreeSewing under its license, or `garment-pattern-fit` output) with the missing pieces added; a cloth price that rises with width; multi-ply spreading and size mixing (see `garment-markercost`); an exact polygon reference on small markers.

## Owner steps
None required. Cutting a real marker from a bought pattern and weighing the cloth used would test the 0.68 to 0.82 range.

## Outside dependencies (vitamins)
Python, numpy, scipy, the sibling projects `garment-nesting` and `garment-teardown`. The piece shapes, cloth prices and every other cost input come from outside the model.
