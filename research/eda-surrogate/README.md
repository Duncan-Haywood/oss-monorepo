# eda-surrogate: can word-level RTL features predict Yosys cell counts well enough to screen a design search, and does that survive a change of design family? (fifth milestone of track 7)

Why it seemed worth doing: `PROJECTS.md` track 7 asks for a surrogate trained on the evaluation log that screens proposals, with held-out error, evaluations saved, and what happens when the design family changes. The earlier track-7 logs hold one family (a MAC engine, 40 designs), which cannot answer the last question, so this project builds four small generator families of its own and tests across them. Produced with AI assistance (Claude). **Stylised and preliminary:** 133 small designs, a synthesis-only target, and no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-surrogate/

**Builds on.** The question and the track come from `research/eda-harness`, `research/eda-proposers` and `research/eda-fidelity` (same Yosys 0.33 flow idea; this project does not reuse their logs or code). Tools: Yosys (Wolf, Glaser and Kepler, 2013, "Yosys - A Free Verilog Synthesis Suite", Austrochip) with ABC (Brayton and Mishchenko, 2010, "ABC: An Academic Industrial-Strength Verification Tool", CAV). Models: non-negative least squares (Lawson and Hanson, 1974, *Solving Least Squares Problems*), ridge regression, and gradient boosting (Friedman, 2001, "Greedy function approximation: a gradient boosting machine", *Annals of Statistics* 29(5):1189-1232), all through scikit-learn (Pedregosa et al., 2011, *JMLR* 12:2825-2830). Context on learning for EDA: Huang et al. (2021), a survey of machine learning for EDA, *ACM TODAES*. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- **Four generator families** (`src/eda_surrogate/gen.py`, original Verilog generators): `mac` (p parallel w×w multipliers plus an accumulator; 36 designs), `fir` (a taps-long FIR time-multiplexed over lanes multipliers; 36), `alu` (a w-bit ALU with 2 to 8 operations; 36) and `sorter` (an odd-even transposition network of n w-bit values; 25). `mac` and `fir` also carry an analytic cycle count for a fixed 64-MAC workload, so cells × cycles is a meaningful area-time objective for them.
- **Target**: generic-gate cell count after `synth -top top -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX; stat` (Yosys 0.33). Not area, not post-route.
- **Features** (`src/eda_surrogate/synth.py`): after only `proc; opt -fast`, the word-level netlist is read as JSON and summarised: count and total output bits per cell kind (multiplier, adder, subtractor, comparator, mux, pmux, shifter, logic, flip-flop, other), the sum of A×B widths of multipliers, and port bit counts (24 numbers). This is about 30 times cheaper than synthesis.
- **Models** (`src/eda_surrogate/models.py`): `mean` (geometric mean of training cells, a sanity floor), `linear` (non-negative least squares on the raw features, the classic word-level cost model), `ridge` (ridge on log features, log target) and `gbr` (200 boosted depth-3 trees on log target).
- **Evaluation**: (A) random 5-fold cross-validation over all 133 designs, ten repeats; (B) leave-one-family-out, where a family is predicted by a model that never saw any of it; (C) a screening replay on `mac` and `fir`: synthesise designs in the order of predicted cells × cycles and count syntheses until one is within 2% of the true best, against the mean over 2,000 random orders.

## Reproduce
```bash
sudo apt-get install -y yosys     # 0.33 here; only needed to rebuild the dataset
pip install numpy scikit-learn matplotlib
cd research/eda-surrogate
PYTHONPATH=src python -m unittest discover -s tests         # a few seconds
PYTHONPATH=src python experiments/run.py                    # seconds; reads dataset.jsonl, rewrites results.txt and figure.png
PYTHONPATH=src python experiments/run.py --collect          # about 80 s; rebuilds dataset.jsonl with the Yosys on PATH
```

## Results (from `experiments/results.txt`; dataset in `experiments/dataset.jsonl`)
- 133 designs, 28 to 5,415 cells. Features cost 0.018 s per design, synthesis 0.582 s (32×), so the screening cost is negligible next to one synthesis.
- **Inside the families it was trained on** (A): the non-negative linear model is best, median absolute error 3.9%, within-family Spearman 0.995; ridge 5.7% (0.995); boosting 8.5% (0.985); the mean floor 59.5%. Gradient boosting is worse than the plain linear cost model here because cell count is close to linear in the word-level sizes and trees must stair-step it.
- **When the family changes** (B, median error on the held-out family; Spearman in the raw output):

| held-out family | linear | ridge | gbr | mean |
|---|---|---|---|---|
| alu | 64.6% | 71.5% | 26.8% | 150.4% |
| fir | 37.3% | 210.7% | 16.0% | 46.3% |
| mac | 18.7% | 21.7% | 62.5% | 63.3% |
| sorter | 59.9% | 10.5% | 53.4% | 68.5% |

  No model is good on every family, and the best model changes with the family (gbr on alu and fir, linear on mac, ridge on sorter). Absolute errors of 20% to 200% make the surrogate unusable as an estimator of a new family. Rank agreement survives much better: Spearman 0.75 to 1.00 for every learned model on every held-out family (ridge on `fir` is the lowest, 0.75).
- **Screening** (C, syntheses until a design within 2% of the best cells × cycles is found; random is the mean over 2,000 orders): on `mac` (36 designs) random needs 12.4 syntheses, the linear model 4 out-of-fold and 5 leave-one-family-out, ridge 1 and 4, boosting 2 and 4. On `fir` (36 designs) random needs 18.6 and every surrogate needs 1, in both settings. So a ranking surrogate, even one trained on other families, saved most of the syntheses in this toy space.
- **Where the features hide something** (D): the worst out-of-fold errors for boosting are all two-operation ALUs (28 to 280 cells), over-predicted by 50% to 83%: with two operations Yosys reduces the ALU to a different structure than the word-level cell counts suggest.
- Figure: `experiments/figure.png` (predicted against synthesised cells, out-of-fold and leave-one-family-out, boosting).

## Limitations
- 133 designs in four families that I wrote, all small; the screening pools are 36 designs and both optima sit at an edge of their space (most lanes or fewest taps), which is the easy case for a ranker. `fir` needing exactly one synthesis for every model shows the test is weak, not that the surrogates are strong. Do not read the 12.4-against-1 contrast as a general saving.
- The target is Yosys generic-gate cells, not area or timing, and not post-route. The milestone asks for post-route PPA; OpenROAD is not installed here, so this says nothing about how well the features predict it. Cell count after ABC is also a smoother quantity than routed timing.
- Features were chosen after I had looked at what Yosys emits for these generators, and the four families were written by one author, so the leave-one-family-out numbers probably flatter a genuinely foreign design.
- One Yosys version and one ABC script. Error figures are medians over a small number of designs per family, so differences of a few points are not meaningful. Models are untuned beyond fixed defaults. No confidence intervals on the held-out family errors (there is one split per family).
- Simulated tool runs say nothing about silicon.

## Next steps
Add an OpenROAD post-route target and repeat; use real third-party designs (not generator output) as the held-out family; add a small adaptation step (train on the other families plus a handful of designs from the new one) and report the break-even number of syntheses; feed the surrogate into the `eda-proposers` loop as a screen and compare hypervolume at equal syntheses.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and ABC (apt); NumPy, scikit-learn and matplotlib (pip). All code original, MIT.
