# eda-fidelity: how well do cheap rungs of a chip-design tool ladder rank designs, and does climbing the ladder save synthesis time? (fourth milestone of track 7)

Why it seemed worth doing: `PROJECTS.md` track 7 treats the simulators as a fidelity ladder, the chip-design form of the repository's digital-twin theme: a cheap model stands in for an expensive one only if it ranks designs the same way. This measures that for the `eda-harness` MAC-engine space and runs a successive-halving search that climbs the ladder. Produced with AI assistance (Claude). **Stylised and preliminary:** 40 designs of one toy accelerator, a ladder with three rungs instead of four (no place and route), and the search is a replay over the committed log, not a new tool run.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-fidelity/

**Builds on.** `research/eda-harness` (its committed `eval_log.jsonl`, copied here to `experiments/eval_log.jsonl`, supplies cells, cycles and per-stage seconds; Yosys 0.33, Icarus Verilog 12.0) and `research/chip-accel` (the generator behind it). Methods: successive halving (Jamieson and Talwalkar, 2016, "Non-stochastic best arm identification and hyperparameter optimization", AISTATS), the idea behind Hyperband (Li, Jamieson, DeSalvo, Rostamizadeh and Talwalkar, 2018, *JMLR* 18(185):1-52); multifidelity framing from Peherstorfer, Willcox and Gunzburger (2018), "Survey of multifidelity methods in uncertainty propagation, inference, and optimization", *SIAM Review* 60(3):550-591. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- **Rungs** (`src/eda_fidelity/ladder.py`), all scoring the objective cells × cycles (lower is better):
  - *Rung 0*, free: an analytic model. cells ≈ p·wb² (a multiplier array), cycles = ceil(110/p), where 110 is the one measured p = 1 cycle count (a single calibration point read from the log). The form p·wb² is a textbook multiplier-array guess, but I had already seen the logged cell counts when I chose it, so treat rung 0's agreement as optimistic; no constant is fitted.
  - *Rung 1*: Icarus cycle-accurate simulation gives exact cycles; cells still come from rung 0. Cost = the logged lint + `rtl_sim` seconds.
  - *Rung 2*: Yosys synthesis gives exact generic-gate cells. Cost = rung 1 + the logged `synth` seconds. This is the reference ("truth") for everything below; the harness's second synthesis for its gate-equivalence check is not charged.
  - *Rung 3, post-route*: **not built**: OpenROAD is not installed here, so the ladder stops at synthesis.
- **Rank agreement**: Spearman and Kendall τ-b between each rung's estimate and the rung-2 objective over the 40 designs, plus overlap of the five best.
- **Search at equal tool seconds**: for a budget of B seconds, *random search* synthesises designs in random order until the next would not fit; *successive halving* (η = 3) screens a pool of n₀ designs on rung 0, simulates the best third, synthesises the best third of those, and reports the best true objective synthesised. n₀ is the largest pool whose charged seconds fit in B. Both use the same 2,000 random orders. Evaluating a design is a lookup of what the harness measured, so 2,000 orders cost seconds.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog   # only needed to regenerate the eda-harness log, not for this project
pip install numpy matplotlib
cd research/eda-fidelity
PYTHONPATH=src python -m unittest discover -s tests   # under a second
PYTHONPATH=src python experiments/run.py              # seconds; rewrites results.txt and fidelity.png
```

## Results (from `experiments/results.txt`)
- **Rank agreement with synthesis** (40 designs): rung 0 Spearman 0.741, Kendall 0.549, 2 of the 5 best designs found; rung 1 Spearman 0.798, Kendall 0.592, 2 of 5. The parts are better ranked than the product: analytic cells vs synthesised cells Spearman 0.947, analytic cycles vs simulated cycles 0.939. The analytic cell count is a rank proxy only: it is 0.03 to 0.06 of the synthesised count, so it is useless as an absolute estimate.
- **Search** (best cells × cycles found, as a ratio to the true optimum 48,546 at p = 4, wb = 4; mean over 2,000 orders, 95% bootstrap interval; the optimum is a 40-design lookup so "found" means it was synthesised):

| tool seconds | random search | P(optimum) | successive halving | P(optimum) |
|---|---|---|---|---|
| 5 | 2.295 [2.248, 2.345] | 0.02 | 1.440 [1.422, 1.458] | 0.20 |
| 10 | 2.326 [2.284, 2.368] | 0.05 | 1.070 [1.063, 1.077] | 0.79 |
| 20 | 1.785 [1.759, 1.812] | 0.10 | 1.000 | 1.00 |
| 40 | 1.435 [1.419, 1.452] | 0.18 | 1.000 | 1.00 |
| 80 | 1.197 [1.187, 1.206] | 0.36 | 1.000 | 1.00 |
| 160 | 1.046 [1.042, 1.050] | 0.75 | 1.000 | 1.00 |

  Exhaustively synthesising all 40 designs costs 205 s; halving reaches the optimum with certainty at 20 s (every design screened on rung 0, 14 simulated, 5 synthesised), about a tenth of that. At 5 s, 852 of 2,000 random orders had synthesised nothing and 30 of halving's had; those runs are left out of the means, which flatters random search's row at 5 and 10 s.
- Figure: `experiments/fidelity.png`.

## Limitations
- One 40-design space whose optimum sits at the corner (p = 4, wb = 4); a cheap rung that gets the corner right looks good here. The cell-count proxy p·wb² ignores everything else Yosys does, and I chose it knowing the design is a MAC engine. A different design family would need its own rung 0, and nothing here says the proxy transfers.
- The top rung is synthesis, not place and route, so this does not measure how well synthesis ranks post-route results, the comparison the milestone most wants. OpenROAD is the missing piece.
- The search is a replay over 40 logged evaluations, and per-stage seconds were measured once on one machine, so the seconds are indicative. The logged `synth` times grow with design size, which is part of why screening small designs first pays.
- Optimising a single scalar (cells × cycles). A Pareto-front version (hypervolume as in `eda-proposers`) would let halving's survivors be judged on the whole front.
- Simulated tool runs say nothing about silicon.

## Next steps
Install OpenROAD and add a post-route rung (area, timing), then rerun the correlation and the halving comparison; use a Pareto-aware promotion rule; repeat on `chip-systolic` as a second design family; try Hyperband's multiple brackets instead of one halving schedule.

## Owner steps
None.

## Outside dependencies
Logged results of Yosys 0.33 and Icarus Verilog 12.0 (apt) through `eda-harness`; NumPy and matplotlib (pip). All code original, MIT.
