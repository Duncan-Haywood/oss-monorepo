# garment-nesting: how much cloth does marker making waste, and do annealing and exact methods beat greedy?

Third milestone of the engineered-clothing track (`PROJECTS.md`, track 6). Marker making (laying pattern pieces on a strip of cloth to minimise its length) is a two-dimensional strip-packing problem. This project compares shelf heuristics, bottom-left placement, simulated annealing over placement order, and an exact mixed-integer program, first on small random rectangle markers and then on two stylised garments packed as true polygons. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-nesting/

**Builds on.** The nesting tutorial of Bennell and Oliveira (2008) for the problem framing; the shelf heuristics NFDH and FFDH of Coffman et al. (1980); bottom-left placement (Baker, Coffman and Rivest, 1980); simulated annealing (Kirkpatrick, Gelatt and Vecchi, 1983) over placement orders, in the spirit of order-based nesting metaheuristics; the HiGHS solver (Huangfu and Hall, 2018) through `scipy.optimize.milp`. It extends `garment-teardown`, whose marker efficiency was a fixed assumption. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. Citations were checked against Crossref metadata (title, authors, venue, year, pages); I did not read the papers' full texts, so descriptions of their content are general.

## Method
- `src/garment_nesting/rect.py`: boxes in a strip of fixed width, no rotation (woven cloth has a grain line). `nfdh`, `ffdh`, `bottom_left` (corner-point candidates, lowest y then lowest x), `anneal_rect` (swap and insert moves on the order, decoded by bottom-left, fixed number of decodes), `exact_rect` (disjunctive big-M MILP, HiGHS, time limit; reports whether optimality was proved), `valid_layout` (independent overlap and bounds check, asserted on every result).
- `src/garment_nesting/raster.py`: polygons on a 2 cm grid (conservative cover from 4x4 sub-samples), bottom-left placement found for all positions at once by FFT overlap counts, 180-degree turns allowed, annealing over order and turns.
- Experiment A: 20 random 8-box instances (10 to 60 by 10 to 80 cm, fabric 100 cm wide, seed 0). Experiment B: two stylised garments (a shirt of 9 pieces and a four-gore skirt with waistband, shapes I drew; no seam allowance, one ply, one size) at fabric widths 110, 140 and 150 cm. Experiment C converts efficiency differences to cloth cost at an assumed $7/m^2 (the replica price assumed in `garment-teardown`).
- Efficiency = true piece area / (fabric width x marker length).

## Reproduce
```bash
pip install numpy scipy pytest
cd research/garment-nesting
python -m pytest -q tests                      # 10 tests
PYTHONPATH=src python experiments/run.py      # about 2 minutes; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
All numbers are from one seeded run. Experiment A (20 random 8-box markers, 100 cm fabric; exact solver proved optimality on 19 of 20):

| method | mean gap to exact | worst gap | matches exact |
|---|---|---|---|
| NFDH shelves | 19.8% | 46.8% | 0/19 |
| FFDH shelves | 17.0% | 46.8% | 0/19 |
| bottom-left, largest area first | 7.3% | 27.9% | 3/19 |
| simulated annealing (500 decodes) | 0.5% | 7.4% | 16/19 |

- Gaps are over the 19 proved-optimal instances. Mean efficiency: NFDH 0.728, bottom-left 0.802, annealing 0.851, against 0.856 for the area bound on the proved optima. Annealing beat plain bottom-left on 15 of 20 instances. On these small boxes with 8! = 40,320 possible orders, 500 decodes find the optimum most of the time; this says little about large markers.
- Greedy shelves leave a large share of the achievable saving on the table: at n=8 the best marker is about 17% shorter than the NFDH marker on average.

Experiment B (stylised shirt, 1.201 m^2 of pieces, and skirt, 0.811 m^2; best of 5 annealing seeds):

| garment, width | bbox NFDH | bbox SA | polygon SA (best) | efficiency bbox NFDH -> polygon SA |
|---|---|---|---|---|
| shirt 110 cm | 214 cm | 150 cm | 136 cm | 0.51 -> 0.80 |
| shirt 140 cm | 142 cm | 132 cm | 126 cm | 0.60 -> 0.68 |
| shirt 150 cm | 140 cm | 132 cm | 120 cm | 0.57 -> 0.67 |
| skirt 110 cm | 128 cm | 128 cm | 116 cm | 0.58 -> 0.64 |
| skirt 140 cm | 120 cm | 120 cm | 82 cm | 0.48 -> 0.71 |
| skirt 150 cm | 120 cm | 120 cm | 68 cm | 0.45 -> 0.80 |

- Polygon nesting beat box packing with the same annealing budget in every case (the geometry effect alone): about 5% shorter for the shirt at 140 cm, 9% at 110 and 150 cm, and 9% to 43% for the skirt (9%, 32%, 43%), where alternating the trapezoidal gores 180 degrees lets them interlock.
- Marker length depends strongly on fabric width (shirt: 136 cm at 110 wide, 126 cm at 140 wide), and not monotonically in efficiency: the narrower cloth gave the higher efficiency here.
- Best polygon efficiencies of 0.64 to 0.80 are in the range `garment-teardown` assumed (0.78 to 0.80) for coats, but these are different, simpler garments and one ply, so this does not validate that assumption.
- Experiment C: the gap from bounding-box NFDH to polygon annealing is worth $0.92 to $6.04 of cloth per garment at the assumed $7/m^2 (full list in `results.txt`). Cloth is a small cost for a $7/m^2 shirt; it matters more at higher cloth prices, which are not modelled here.

## Limitations
- **Stylised.** The garments are my own shapes with no real pattern, no seam allowance, no notches, one ply and one size. Real markers stack plies, mix sizes and obey fabric-specific rules (pile, stripes to match, defects).
- Experiment A uses axis-aligned boxes; the exact solver is only practical at about 8 pieces. Optimality is proved only where the solver says so; the count is reported.
- Experiment B has no exact reference, so "poly SA" is an upper bound on the best marker, not an optimum. The annealing budget is small (200 decodes), results over 5 seeds, and the raster rounds lengths to 2 cm and is slightly conservative.
- Part of the "bbox NFDH to poly SA" gap is the weak shelf heuristic, not geometry. The geometry effect alone is "bbox SA" against "poly SA".
- Only 180-degree turns and no mirroring; pairs of left and right pieces could be mirrored in practice.
- Cloth price is an assumption; nothing was built or cut.

## Next steps
Take real piece shapes from `garment-pattern-fit` or FreeSewing, add seam allowance and multi-ply, compare against an exact polygon method on very small markers, and feed the measured efficiency back into `garment-teardown` in place of its fixed 0.78 to 0.80.

## Owner steps
None required. Cutting a real marker and weighing the cloth used is an owner step if the numbers are to be checked against a physical garment.

## Outside dependencies (vitamins)
Python, numpy, scipy (including the HiGHS MILP solver). Cloth, patterns and prices come from outside the model.

## References
- Baker, B. S., Coffman, E. G. Jr., Rivest, R. L. (1980). Orthogonal packings in two dimensions. *SIAM J. Comput.* 9(4):846-855. doi:10.1137/0209064
- Bennell, J. A., Oliveira, J. F. (2008). The geometry of nesting problems: A tutorial. *Eur. J. Oper. Res.* 184(2):397-415. doi:10.1016/j.ejor.2006.11.038
- Coffman, E. G. Jr., Garey, M. R., Johnson, D. S., Tarjan, R. E. (1980). Performance bounds for level-oriented two-dimensional packing algorithms. *SIAM J. Comput.* 9(4):808-826. doi:10.1137/0209062
- Huangfu, Q., Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. *Math. Program. Comput.* 10:119-142. doi:10.1007/s12532-017-0130-5
- Kirkpatrick, S., Gelatt, C. D., Vecchi, M. P. (1983). Optimization by simulated annealing. *Science* 220(4598):671-680. doi:10.1126/science.220.4598.671
