# eda-flowtune: does the best ABC pass sequence for one design carry over to another? (third milestone of track 7)

Why it seemed worth doing: flow tuners in the FlowTune and DRiLLS tradition search synthesis recipes per design. If a recipe found on one design also works on the next, tuning could be done once; if not, every design needs its own budget. This measures that on eight small SKY130-mapped designs by evaluating the whole recipe space exhaustively, so every statement is checked against ground truth. Produced with AI assistance (Claude). **Stylised and preliminary:** eight toy combinational designs, one cell library, ABC's static delay with no wires, no place and route. Nothing here is a claim about real chips or about tuners on large designs. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-flowtune/

**Builds on.** `research/chip-scriptsearch` (the space of ABC pass sequences and the random-search and hill-climbing baselines, re-implemented in `src/eda_flowtune/analysis.py` for a single design) and `research/chip-ppa-sky130mac` (the Yosys + ABC + SKY130 liberty flow, imported by relative path, and `mac4`). The SKY130 HD liberty file comes from OpenROAD-flow-scripts (Apache-2.0), fetched at a pinned commit by `fetch_pdk.sh`, not vendored. Motivation from the literature, listed in the track brief and not reproduced here: Brayton and Mishchenko (2010), "ABC: An Academic Industrial-Strength Verification Tool", CAV (the tool); Yu, Xiao and De Micheli (2018), synthesis flows developed without human knowledge, DAC; Hosny et al. (2020), DRiLLS, ASP-DAC; Neto et al. (2023), FlowTune, *IEEE TCAD*. No number from those papers is compared with anything here.

## Question
Take the best ABC recipe (a sequence of up to three optimisation passes) for design A. How much worse is it on design B than B's own best? Does a recipe that does well across *other* designs beat picking a recipe blind, and does using it to warm-start a hill climber help at a budget of 5 to 40 evaluations?

## Method
- **Space.** All 400 sequences of length 0 to 3 over {`balance`, `rewrite`, `rewrite -z`, `refactor`, `refactor -z`, `dc2`, `dch`}, run as `strash; <passes>; map` onto SKY130 HD cells. Same passes as `chip-scriptsearch`.
- **Designs** (`designs/`): `mac4` (a*b+c), `mul6` (6x6 multiplier), `add12` (12-bit adder), `alu8` (add, subtract, and, xor), `popcnt12`, `sad2` (sum of two absolute differences), `rot8` (barrel rotate) and `cmpsel` (max and equality of two bytes). All combinational and small (about 100 to 2,400 &micro;m&sup2;).
- **Score.** Area (&micro;m&sup2;, `stat -liberty`) &times; ABC's static delay (ns), lower is better, as in `chip-scriptsearch`. All 3,200 points are evaluated once (`experiments/table.json`, deterministic), so each design's true optimum is known. ABC aborts on some sequences; those score infinity, are excluded from correlations and consensus rankings, and cost one evaluation when a search draws them.
- **Transfer.** Regret of a sequence on design B = score on B divided by B's optimum (1.0 is best). *Single-source*: B scored under A's own best sequence. *Consensus* (leave-one-out): for target T, the sequence with the lowest mean log-regret over the other seven designs, among sequences that work on all of them; T is never consulted.
- **Search study.** On each target, at budgets 5, 10, 20, 40 distinct evaluations, 200 seeds each, replayed from the table: random search (length uniform on 0 to 3), first-improvement hill climbing (restart after 8 failed edits), and the same climber warm-started by evaluating the target's leave-one-out consensus top 3 first. Reported as the median of best-found / optimum, and the share of seeds reaching the optimum.
- **Correctness.** Each design's best mapped netlist is proved equal to its RTL by a Yosys miter and `sat -prove` over all inputs (all eight pass).
- **Not done:** OpenROAD placement settings (utilisation, clock period, density). OpenROAD is not installed in this environment, and `chip-pnr` covers a single design; the milestone's second half remains open.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys && pip install numpy matplotlib   # Yosys 0.33 here
cd research/eda-flowtune
sh fetch_pdk.sh pdk                       # sparse clone of ORFS at a pinned commit
python3 -m unittest discover -s tests     # 11 tests, a few seconds
python3 experiments/run.py                # about 10 min on 4 cores to build the table; seconds once table.json exists
```
`experiments/table.json` is committed; delete it to recompute from the flow. Outputs: `experiments/results.txt`, `experiments/transfer.png`.

## Results (from `experiments/results.txt`, Yosys 0.33)
- **Each design has its own best recipe.** The optima differ (for example `rewrite; rewrite -z; dch` for `mac4`, `refactor -z; rewrite -z` for `add12`, `dch; dc2; dch` for `cmpsel`), and for `rot8` the best is no passes at all. A recipe's score ranking barely agrees between designs: Spearman correlation of scores over the sequences that work on both is between &minus;0.51 and 0.46 for all 28 pairs, median 0.16.
- **Transfer is poor.** Across the 56 ordered pairs, the source's best recipe scores a mean 1.31&times; (median 1.25&times;, worst 2.06&times;) the target's optimum. Only 2 of 56 (3.6%) are within 5% of it, and both involve the same pair: `mac4`'s recipe on `popcnt12` (1.000, the same score as its own best, `rewrite; dch`) and `popcnt12`'s on `mac4` (1.006).
- **A consensus recipe helps a little, not reliably.** The mean leave-one-out regret is 1.22&times; for the consensus recipe, against 1.26&times; for the median sequence and 1.31&times; for a single-source recipe. It is good for `mac4` (1.02&times;, 7th of 400) and `cmpsel` (1.16&times;, 43rd), and worse than the median sequence for `alu8`, `mul6` and `sad2`. The no-pass baseline `strash; map` is within 28% of optimum on `add12` and exactly optimal on `rot8`, but 1.36&ndash;1.88&times; off on the other six; `resyn2` (a longer script, outside the space) is 1.05&ndash;1.50&times;.
- **Warm-starting does not pay on average.** Mean over designs of the median best-found / optimum, 200 seeds:

| budget | random | hill climbing | warm-started hill climbing |
|---|---|---|---|
| 5 | 1.155 | 1.162 | 1.135 |
| 10 | 1.099 | 1.092 | 1.105 |
| 20 | 1.077 | 1.078 | 1.079 |
| 40 | 1.053 | 1.050 | 1.054 |

 The warm start wins clearly on one design, `mac4` (median 1.006 and a 14&ndash;20% chance of the optimum at budgets 10 to 40, against 1.05, 1.05 and 1.007 and 0&ndash;6% for random), is ahead at budget 5 on average (1.135, a difference of 0.02), and is flat or slightly behind elsewhere (for example `popcnt12` at budget 10: 1.191 against 1.014 for random). The three methods are within noise of each other from budget 20 on. The table is per-design medians; confidence intervals across seeds were not computed.

## Limitations
- **Eight small designs, hand-picked.** The designs are arithmetic and datapath fragments I chose, and `rot8` is degenerate (no pass helps; 98&ndash;100% of random seeds find its optimum). Similarity between designs could look very different on larger or control-dominated blocks, or on a different cell library.
- **One tool version and one score.** Yosys 0.33 with its bundled ABC; area&times;delay under ABC's static delay with no wire load. `chip-pnr` shows such numbers are not post-layout numbers, so the ranking of recipes may change after place and route. This is a simulated-flow result, not a claim about a fabricated chip.
- **The space is small and shared.** Sequences have at most three passes from seven, and the seeds all replay one table, so the comparison is about this landscape. 60 of 400 sequences abort on most designs (44 on `popcnt12`, 52 on `mac4`), which is consistent with the `dch`-then-`rewrite`/`refactor` failure `chip-scriptsearch` reported, but this was not re-checked sequence by sequence. A tuner that avoided them would do better than every method here.
- **Consensus uses a mean over seven designs of unknown representativeness, and the warm start is three evaluations.** A larger donor pool, a learned similarity from design features, or a bandit over passes might transfer better; none was tried. The negative result is for these simple transfer rules only.
- Search uses the same seed values across methods at each budget, so the methods' first draws are partly correlated. No hyperparameters were tuned.

## Next steps
Add OpenROAD settings to the space once it is installed (milestone 3's other half) and test whether the ABC-recipe ranking survives layout; feed `eda-harness`'s proposers this space; try design-feature similarity (gate-count mix, logic depth) to choose a donor design; extend to length 4 and 5 sequences with ABC's failure pattern given to the proposer.

## Owner steps
None.

## Outside dependencies (vitamins)
Yosys 0.33 with its ABC (apt); the SKY130 HD liberty file from OpenROAD-flow-scripts (fetched); NumPy and matplotlib (pip); `chip-ppa-sky130mac`'s flow module in this repository. All other code original, MIT.
