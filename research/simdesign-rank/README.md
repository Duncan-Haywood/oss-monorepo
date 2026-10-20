# simdesign-rank: do cheap beam and 2D models rank candidate cantilever designs like 3D finite elements?

Track 5 (simulation-first design, `PROJECTS.md`). `simdesign-fidelity` asked where each model puts the *optimum*. This asks the question a search loop actually depends on: does a cheap model put candidate designs in the *same order* as the expensive one? The recent `simdesign-*` projects had become micro-variants of one bracket study, so this is a new question on the same models, not another mesh or seed variant. Produced with AI assistance (Claude).

**Headline.** On 3 seeds of 80 random cantilevers, Euler–Bernoulli, Timoshenko and 2D plane-stress models all rank designs by stiffness per mass almost exactly like a 3D finite-element reference (Kendall τ 0.987 to 0.996), and the 3D-best design is always ranked first, although a single design's merit is off by up to 14%.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-rank/

**Builds on.** The models of `research/simdesign-fidelity` (imported from there, not copied): Euler–Bernoulli and Timoshenko beam theory, and scikit-fem (Gustafsson and McBain, *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>) 2D and 3D elasticity. Kendall's τ is Kendall (1938), "A new measure of rank correlation", *Biometrika* 30:81–93 (from memory, not re-checked online). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- A design is (L, h, b): length 20 to 160 mm, depth 4 to 30 mm, width 5 to 60 mm, log-uniform, keeping L/h ≥ 2 (the `simdesign-fidelity` stress read needs 1.6h of beam). Tip force 100 N, assumed FDM-plastic properties (E 3000 MPa, ν 0.36). 80 designs per seed, seeds 1 to 3.
- Merit = 1 / (tip deflection × mass): stiffness per unit mass, higher is better. Models: `euler`, `timoshenko`, `fe2d` (4 elements over depth), and the reference `fe3d` (2 elements over depth, as in `simdesign-fidelity`).
- Agreement with the reference: Kendall τ over all 3,160 pairs per seed; overlap of the top 8; where the 3D winner sits in the cheap model's order; and τ on the stubby (L/h < 6) and wide (b/h > 2) subsets, where `simdesign-fidelity` found the models differ most.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-rank
python -m pytest -q tests          # 5 tests
python experiments/run.py          # writes experiments/results.txt (about 8 minutes, the 3D solves)
python experiments/figure.py       # draws experiments/rank_agreement.png from results.txt
```

## Results (from `experiments/results.txt`)
- **Rankings agree.** τ vs 3D over all designs: Euler–Bernoulli 0.992, 0.987, 0.994; Timoshenko 0.994, 0.994, 0.996; 2D 0.994, 0.993, 0.996 (seeds 1 to 3). The 3D-best design is rank 1 in every cheap model in all 9 cases.
- **Values do not.** Merit relative to 3D ranges from 0.89 to 1.15 per design. Euler–Bernoulli is unbiased on the median (0.99) but overestimates merit by up to 14.5% (stubby designs, no shear); Timoshenko and 2D underestimate it (median 0.96 to 0.98, down to 0.89), the plane-stress effect on wide sections found in `simdesign-fidelity`. A cheap model can be a good *ranker* and a poor *predictor*.
- **Top-8 overlap** is 8 of 8 in five cases and 7 of 8 in four (Euler–Bernoulli seeds 1 and 2; Timoshenko and 2D seed 2): the disagreements are swaps at the edge of the top group.
- **Stubby designs agree least:** τ 0.962 to 0.989 on the 34 to 40 stubby designs per seed (Euler–Bernoulli lowest), against 0.988 to 1.000 on wide ones. Even the worst subset is still strongly concordant.

## Limitations
- One load case, one merit (stiffness per mass), assumed isotropic material. No stress or feasibility constraint enters the ranking, so this says nothing about ranking *feasible* designs.
- The 3D reference is coarse (2 elements over depth; `simdesign-fidelity` measured its deflection still moving about 0.4% under refinement), so τ differences in the third decimal are not meaningful. Only three seeds, 9 comparisons.
- A smooth merit over a smooth design space is easy to rank; a design space with discontinuities (contact, buckling, topology changes) may not behave so well.

## Next steps
Add the stress limit and rank only feasible designs; try a merit with a buckling or stress-concentration term; measure how much search budget a cheap-model-then-3D re-rank saves at equal final quality (a multi-fidelity loop).

## Owner steps
None needed (simulation only).

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, matplotlib; pytest). The material and load are assumptions.
