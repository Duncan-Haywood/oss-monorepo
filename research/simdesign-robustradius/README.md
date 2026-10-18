# simdesign-robustradius: does the filter radius or the threshold gap set the minimum feature size of a robust topology-optimised beam?

Follow-up to `simdesign-robust` (track 5, `PROJECTS.md`), taking its first listed next step: vary the filter radius and the threshold gap Δη. It is a sweep rather than a new seed because the previous README left open which of the two controls feature size; the answer here is that, by the opening-rule measure, neither does clearly. Produced with AI assistance (Claude). Stylised: 2D dimensionless compliance, one load case, one run per cell.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-robustradius/

**Builds on.** `simdesign-robust`, `simdesign-heaviside` and `simdesign-topopt` (this repository), imported unchanged. Wang, Lazarov and Sigmund (2011), "On projection methods, convergence and robust formulations in topology optimization", *Struct. Multidisc. Optim.* 43(6):767–784, <https://doi.org/10.1007/s00158-010-0602-y>. No code copied.

## Method
Half-MBB beam, 120×40 elements, volume fraction 0.5, p = 3, β continuation 1…64 (30 iterations each). Filter radius r<sub>min</sub> ∈ {2, 4, 6} elements × Δη ∈ {0 (plain Heaviside), 0.1, 0.2}, nine designs, one run each. Every design is re-analysed at projection thresholds 0.7, 0.5 and 0.3, so the plain design is judged by the same erosion and dilation as the robust ones. Measure: 98% opening-rule minimum length scale of solid (Ms) and void (Mv) in pixels, from `simdesign-heaviside`.

## Reproduce
```bash
pip install numpy scipy matplotlib pytest
cd research/simdesign-robustradius
python -m pytest -q tests          # 3 tests
python experiments/run.py          # writes experiments/results.txt and designs.png (about 4 minutes on 4 cores)
```

## Results (from `experiments/results.txt`)
| r<sub>min</sub> | Δη | c eroded | c blueprint | c dilated | grey | Ms / Mv (px) |
|---|---|---|---|---|---|---|
| 2 | 0 | 3.6×10⁹ | 187.0 | 179.6 | 0.2% | 1 / 1 |
| 2 | 0.1 | 255.0 | 200.3 | 187.0 | 0.7% | 1 / 3 |
| 2 | 0.2 | 219.4 | 200.9 | 184.2 | 0.8% | 3 / 1 |
| 4 | 0 | 2.1×10⁹ | 192.9 | 173.4 | 1.4% | 3 / 3 |
| 4 | 0.1 | 275.5 | 195.3 | 177.2 | 1.1% | 3 / 5 |
| 4 | 0.2 | 226.3 | 194.7 | 177.0 | 1.4% | 3 / 5 |
| 6 | 0 | 6.2×10⁷ | 196.8 | 166.9 | 2.6% | 3 / 3 |
| 6 | 0.1 | 265.0 | 195.5 | 171.6 | 1.7% | 3 / 5 |
| 6 | 0.2 | 261.0 | 200.4 | 173.6 | 2.2% | 3 / 5 |

- **A gap of 0.1 is enough for erosion robustness.** At every radius, Δη = 0.1 brings the eroded (η = 0.7) compliance from a disconnected 10⁷–10⁹ down to 255–276, against 187–200 at the blueprint. Δη = 0.2 gives 219, 226 and 261 at r<sub>min</sub> 2, 4 and 6: lower eroded compliance at the two smaller radii, no difference at 6 (265 against 261), and a blueprint that is not consistently better or worse. The huge Δη = 0 values are the stiffness-floor artefact of a disconnected model: they say "fails", not a number to quote.
- **Radius does not give a clean length-scale control by this measure.** Ms is 1, 3, 3 for Δη = 0 at r<sub>min</sub> 2, 4, 6 and 3 at r<sub>min</sub> 4 and 6 for every Δη: tripling the radius from 2 to 6 changes Ms by at most 2 px, and from 4 to 6 not at all. The measure is coarse (integer pixels, disc sizes stepped by the opening rule), so a modest real change could be hidden, but nothing here shows the radius scaling the feature size.
- **Radius changes the topology, which is probably what the measure sees.** At r<sub>min</sub> 2 the designs keep many thin members (figure), and the measure is dominated by those; at 4 and 6 they collapse to two triangulated cells.
- **Cost of robustness at the blueprint.** Blueprint compliance is +7.1% and +7.4% above the Δη = 0 value at r<sub>min</sub> 2 (200.3 and 200.9 against 187.0), +1.3% and +0.9% at 4, and −0.7% to +1.8% at 6. The r<sub>min</sub> 4, Δη = 0.2 cell reproduces `simdesign-robust`'s 120×40 row (226.3 / 194.7), as a check on the setup.

![Blueprint designs, radius by threshold gap](experiments/designs.png)

## Tests
Grid is 3×3 and includes the plain case; a case returns all fields, grey share in [0, 1] and eroded ≥ dilated compliance; determinism.

## Limitations
- One problem (half-MBB), one mesh (120×40), one run per cell, no seeds. Differences of a few percent in blueprint compliance, and one-pixel differences in Ms, are within what a different start or schedule could move; nothing here is a statistical claim.
- Ms and Mv are 98% opening-rule integers; they cannot resolve a gradual change.
- Thresholding the filtered field stands in for etch error; real over/under-etch is geometric. Not compared with published figures.
- The filter radius is in elements on one mesh, so radius and physical length are not separated.

## Next steps
Repeat on a second mesh to separate radius in elements from radius as a share of the beam; replace the opening-rule integer with a continuous measure (for example the medial-axis thickness distribution); try the minimum-feature constraint of the paper.

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, matplotlib; pytest for tests). The beam, material, load and thresholds are assumptions.
