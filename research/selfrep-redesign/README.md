# selfrep-redesign: which part substitutions cut a RepRap's vitamins most?

Follow-up to `selfrep-closure` (track 1, `PROJECTS.md`): instead of adding machines to the shop, change the machine. It searches over a small set of assumed substitutions (printed bushings, printed nuts, wooden rods and so on) that turn vitamin lines of the Prusa Mendel into makeable ones, under an assumed performance-penalty budget. Produced with AI assistance (Claude). Simulated/computed only; no real part was tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-redesign/

**Builds on.** `selfrep-closure` in this repository (bill of materials from the RepRap wiki, "Prusa Mendel (iteration 2)", via that project; RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). It builds on none of the labs in `prompt.md`.

## Method
- Seven substitutions in `src/selfrep_redesign/design.py`, each removing some vitamin lines and adding a printed or router-cut line, with an arbitrary penalty in [0.3, 0.9]. **Substitutions, replacement masses and penalties are all my assumptions**, not published figures, and nothing says a printed M8 nut or a dowel rod works.
- Objective: closure (by lines, mass or cost, with `selfrep-closure`'s assumed masses and costs) of the printer + router + laser shop, LM8UU variant.
- Search: exhaustive over all 2^7 subsets within the penalty budget, a greedy gain-per-penalty rule, and a no-LLM random-search baseline (8 random subsets per run, mean of 200 runs).
- Sensitivity: each penalty scaled by a log-uniform factor in [0.5, 2], 500 draws, to see how stable the best set is.

## Reproduce
```bash
cd research/selfrep-redesign
python3 -m unittest discover -s tests -v     # 5 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- Baseline (no substitution): 43.1% line, 22.4% mass, 15.9% cost closure; 29 vitamin lines.
- Applying all seven substitutions (penalty 3.9) takes vitamin lines from 29 to 19 and closure to 60.4% / 35.8% / 47.7% (lines / mass / cost). **Mass closure stays below 36%**: motors, electronics, threaded rods and the hot end remain vitamins under every set.
- Cost closure responds much more than mass: at budget 1.0 the best set (printed idlers and nuts) gives 41.2% against 15.9%, because nuts and bearings are many cheap lines, while mass closure at the same budget rises only to 28.6% (wooden rods).
- Greedy gain-per-penalty matched the exhaustive optimum in 17 of 21 (objective, budget) rows (3 of them budget 0, where nothing can change) and was at most 2.5 points short (mass closure 28.6% vs 26.1% at budget 1.0). Random search with 8 evaluations was 0 to 16 points below exhaustive, 0 only at budget 0.
- The best set at a given budget depends on which objective is chosen and, at budget 2.0 for mass, on the assumed penalties: across 500 penalty draws no set won more than 13% of draws, and each of the five most frequent sets (about half of all draws together) contains wooden rods and printed M8 nuts.

## Limitations
- Everything is assumed: the substitution list, replacement masses, penalties (one arbitrary unit, additive) and the router's ability to cut dowel. A real printed nut or chain drive may not work at all; the penalty does not model failure.
- Only the printer is redesigned, one at a time from a fixed list of seven; real redesign would use a CAD/FEA loop (track 5) and possibly an LLM proposer, neither of which is used here. With 2^7 subsets exhaustive search is trivial, so the greedy and random comparisons only show the shape of the problem.
- Closure counts parts as makeable if a seed process exists, as in `selfrep-closure`; feedstock (filament, dowel) is imported and not counted.
- Cost closure is high partly because box-size fastener lines are included, as in `selfrep-closure`.

## Next steps
Replace the assumed penalties with a mechanical model (for example `simdesign-fidelity`-style beam analysis of a printed versus steel rod) and let a proposer, LLM or CMA-ES, invent substitutions instead of choosing from a list.

## Owner steps
- Print and test the candidate substitutions (printed M8 nuts, bushings, a dowel rod) and replace the penalties with measured stiffness, wear and failure rates.
- Replace assumed masses and costs with weighed parts and dated quotes.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-closure` source tree (relative path). The vitamins of the redesigned printer are the lines still non-makeable: motors, electronics, threaded and smooth rods unless replaced, hot end, glass, tubing, belts unless replaced.
