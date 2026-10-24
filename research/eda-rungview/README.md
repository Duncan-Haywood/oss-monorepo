# eda-rungview: if a design search only sees generic-gate numbers, does it find a worse SKY130 Pareto front? (follow-up to `eda-noisy`, track 7)

Why it seemed worth doing: `eda-noisy` showed that a proposer's lead over random search shrinks with error in the objectives it sees, but injected that error as synthetic Gaussian noise and listed "replace the synthetic error with the measured disagreement between `eda-fidelity`'s rungs" as its next step. `eda-sky130rung` has since measured the real second rung (SKY130 HD mapped area and delay) for the same 40 designs, so no number here is invented. Produced with AI assistance (Claude). **Preliminary:** 40 designs of one toy accelerator, one ABC script, no place and route, and the error objective is shared by both views (it is not a tool output of either rung).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-rungview/

**Builds on.** `research/eda-proposers` (proposers, runner, hypervolume), `research/eda-noisy` (scoring convention and the iid-noise model, reimplemented here on the 40-design space), `research/eda-sky130rung` (the measured mapped area and delay in `mapped.json`) and `research/eda-harness` (the designs). Multi-fidelity background: Peherstorfer, Willcox and Gunzburger (2018), *SIAM Review* (cited from memory, not re-read). No CU Boulder lab's work is built on.

## Method
- Space: the 40 MAC-engine designs (1 to 8 lanes, 4 to 8 bits). Three objectives, all minimised and scaled to [0, 1] over the 40 designs.
- **True view** (scoring): SKY130 mapped area, cycles x mapped critical-path delay (latency), held-out error.
- **`cells` view** (what `eda-proposers` and `eda-noisy` used): generic cell count, cycles, error. **`cells_dep` view**: generic cells, cycles x generic logic depth, error.
- Each of the four stochastic proposers (annealing, genetic, NSGA-II, TPE) and random search searches one view at a budget of 12 or 20 distinct designs, 200 paired seeds. The designs it picked are scored by the hypervolume ratio on the *true* view (reference 1.1).
- Control: the true view plus iid Gaussian noise at sigma = 0.079 (the mean measured RMS error of the `cells` view's two disagreeing objectives) and 0.2, to compare structured measured error with `eda-noisy`'s model.

## Result
- **The measured error is small.** Against SKY130 truth, `cells` has RMS error 0.036 on area (Spearman 0.995) but 0.123 on latency (Spearman 0.742, because cycles ignore delay). Adding generic depth (`cells_dep`) cuts the latency error to 0.053 (Spearman 0.930).
- **Searching the generic view cost nothing measurable.** Paired against searching the true view, the cost is within +-0.01 for every proposer and view, and most 95% CIs include 0 (`results.txt`). TPE at budget 20: 0.968 on `true`, 0.968 on `cells`, 0.966 on `cells_dep`; random: 0.931.
- **TPE's lead over random survives the real error:** +0.037 [+0.032, +0.042] on `cells` at budget 20 (same as on the true view), +0.027 at budget 12. NSGA-II and the genetic method have small leads (+0.006 to +0.013) and annealing is not better than random, as in `eda-proposers`.
- **The generic fronts differ from the SKY130 front, but the search score barely moves.** The true front is 11 designs; `cells` and `cells_dep` give 12, with p8w4, p8w5 and p8w6 replacing p4w7 and p8w8. Hypervolume is a coarse measure of that difference.
- **Matched iid noise is a fair stand-in here.** At sigma 0.079 the noisy-view gains (TPE +0.033) are close to the measured-view gains (+0.037). At sigma 0.2, TPE's cost against the true view is -0.012 [-0.016, -0.008] at budget 20, larger than anything the measured error caused.

Figure: `experiments/gain_by_view.png`. Full tables: `experiments/results.txt`.

## Reproduce
```bash
pip install numpy matplotlib
cd research/eda-rungview
PYTHONPATH=src python -m unittest discover -s tests      # 6 tests
PYTHONPATH=src python experiments/run.py                 # about a minute; writes experiments/results.txt
python experiments/figure.py
```
Needs `research/eda-proposers` and `research/eda-sky130rung` in the tree; no EDA tools are run (the mapped numbers are committed in `eda-sky130rung`).

## Limitations
- Yosys 0.33 and ABC `strash; dc2; map; topo; stime` at the SKY130 HD tt_025C_1v80 liberty (ORFS commit e5cc6e799f). A different ABC script could change the generic-to-mapped disagreement (see `eda-flowtune`).
- Mapped area and delay are synthesis estimates with no place and route, wire load or clock-tree effects. They are not sign-off results and say nothing measured about silicon. Treating them as "truth" is itself an approximation.
- One design family with 40 points and strong structure (cells scale smoothly with lanes and bits); a space with less regular rung disagreement could behave differently.
- Error (1 minus held-out accuracy) is the same number in all views, so the third objective contributes no disagreement.
- Budgets of 12 and 20 of 40 designs are a large share of the space, which flatters random search.

## Next steps
Add a post-route rung (OpenROAD, not installable here) and a second design family (`chip-systolic`); let each proposer spend part of its budget re-checking picks on the true rung (the multi-fidelity step).

## Owner steps
None.

## Outside dependencies
None to run (NumPy; matplotlib for the figure). All code original, MIT.
