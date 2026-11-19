# garment-sizeset: how many sizes does it take to fit a population, and how much does a regular S-M-L grid waste?

Free of any survey data: this is a **stylised** study on a synthetic bust/hip population (preliminary). It asks, in a searcher's words, "how many clothing sizes do you need to fit 80% of people?" and "is a regular size grid the best size run?" Choosing k sizes so the most people fit is a maximum-coverage problem, so I solve it exactly (integer program), greedily, and as a regular grid, and check the answer on fresh people. Track 6 (`PROJECTS.md`), a question new to this repository (not to the field: see Builds on). Produced with AI assistance (Claude).

**Live page:** https://marisstella.app/research/garment-sizeset/

**Builds on.** Maximum coverage and the greedy rule's 1 - 1/e guarantee: Nemhauser, Wolsey and Fisher (1978), "An analysis of approximations for maximizing submodular set functions - I", *Mathematical Programming* 14, 265-294. The apparel sizing problem itself was solved as an integer programme by Tryfos (1986), "An integer programming approach to the apparel sizing problem", *Journal of the Operational Research Society* 37(10), and by McCulloch, Paal and Ashdown (1998), "An optimisation approach to apparel sizing", *JORS* 49(5); this study is a small synthetic re-run of that idea, not a new method. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It links to `garment-pattern-fit` only in spirit (fit is scored there on a body; here a size "fits" if both measurements are within a tolerance).

## Method
- `src/garment_sizeset/sizes.py`: a person is (bust, hip) in cm, drawn from a bivariate normal with **assumed** means 95 and 100 cm, sd 8 cm each, and correlation rho in {0, 0.5, 0.9}. These numbers are not from any survey; a real study needs one (for example the US Army's ANSUR II).
- A size is a point; it fits a person whose bust **and** hip are both within a tolerance of +-4 cm (also assumed).
- `exact`: optimum over candidate sizes placed at sample points, as a 0-1 integer program solved with HiGHS (`scipy.optimize.milp`). `greedy`: pick the size covering most still-unfitted people. `grid_run`: a regular r x c lattice with spacing 2 x tolerance (every size a fixed step from the next in both measurements), r x c <= k, shifted to its best position (this one is not limited to sample points).
- 300 people per draw, 3 seeds, k = 1, 2, 3, 4, 6, 8.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/garment-sizeset
python -m pytest -q tests                      # 6 tests
PYTHONPATH=src python experiments/run.py > experiments/results.txt   # about 40 s
python experiments/figure.py                   # writes experiments/coverage.svg
```

## Results (from `experiments/results.txt`; mean of 3 seeded draws of 300)
Share fitted in-sample (sizes chosen and scored on the same 300 people), tolerance +-4 cm:

| rho | k | grid | greedy | exact |
|---|---|---|---|---|
| 0.0 | 4 | 0.514 | 0.497 | 0.522 |
| 0.0 | 8 | 0.698 | 0.711 | 0.747 |
| 0.5 | 4 | 0.540 | 0.537 | 0.560 |
| 0.5 | 8 | 0.699 | 0.770 | 0.788 |
| 0.9 | 4 | 0.628 | 0.742 | 0.770 |
| 0.9 | 8 | 0.711 | 0.912 | 0.940 |

- **A regular grid is not wasteful when bust and hip are unrelated, and wasteful when they are tightly correlated.** At rho = 0 the exact optimum beats the best grid by 0 to 7 points; at rho = 0.9 by 12 to 25 points. Intuitively, correlated people lie along a diagonal band, and a lattice spends most of its sizes on corners nobody occupies. **Audit correction (2026-11-19, [audit](../../portfolio/quality/audits/2026-11-19-garment-sizeset.json)):** the "grid" here is an axis-aligned lattice, which no sizing standard uses. A regular *graded* run, with bust and hip stepping together as ASTM D5585 and ISO 8559-2 grade sizes, scored on fresh people at rho = 0.9 0.687 at k = 4 and 0.859 at k = 8, against 0.687 and 0.871 for exact and 0.596 and 0.677 for the lattice. So the waste comes from the lattice's orientation, not from the run being regular; a graded regular run is close to optimal in this model.
- **Greedy is near-optimal here:** within 0 to 3.7 points of exact in every cell (all solves proved optimal). It was below the grid by a hair at k = 4 for rho 0 and 0.5, and also at rho 0 k = 6 (0.630 against 0.640) and rho 0.5 k = 1 (0.189 against 0.197).
- **Sizes needed for 80% fitted** (in-sample): 5 for greedy and exact at rho 0.9 (k = 5 is not in the table; run separately it gives 0.802 greedy and 0.836 exact, mean of the three seeds; corrected 2026-11-19 from "6"); more than 8 for all three methods at rho 0 and 0.5, because a +-4 cm box in two uncorrelated dimensions is a small target.
- **Held-out check (section C), which tempers the in-sample gap.** Choosing sizes on 300 people and scoring them on a fresh 20,000 loses 7 to 9 points for the exact solution, because it fits the sample. At rho = 0 the held-out exact set is no better than the grid (k = 4: 0.442 against 0.462; k = 8: 0.663 against 0.650). At rho = 0.9 the advantage survives (k = 8: 0.871 against 0.677). So the gain from non-grid sizes is real mainly when the measurements are strongly correlated, and with few people the optimiser overfits.

## Limitations
- Synthetic Gaussian population with assumed parameters; real body measurements are skewed, have more than two dimensions, and size fit tolerances differ by garment and by stretch fabric. A knit that tolerates +-8 cm changes every number.
- Candidate sizes sit at sample points, so exact is exact only over that set (the grid can sit anywhere, which is why exact is occasionally 0.3 to 0.8 points below it at k = 1).
- Three seeds and 300 people: differences of a point or two are noise. No cost model: more sizes raise stock and pattern-grading cost, which is not modelled here.
- Fit is a pass/fail box, not strain or drape (see `garment-pattern-fit`).

## Next steps
Replace the synthetic population with an open anthropometric survey (licence checked), add a third measurement (waist or height) and a stretch-dependent tolerance, and price the extra sizes through `garment-teardown`.

## Outside dependencies
numpy and scipy (HiGHS solver) from pip. The population is synthetic; no survey data, hardware or paid service is used.
