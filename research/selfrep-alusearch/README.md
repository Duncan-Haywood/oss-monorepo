# selfrep-alusearch: does an aluminium rod change which printer redesign the penalty-budget search picks?

Follow-up to `selfrep-alurod` and `selfrep-redesign` (track 1, `PROJECTS.md`), taking the "re-run the penalty-budget search of `selfrep-redesign` with an aluminium option and a penalty tied to rod sag" next step from `selfrep-alurod`. Produced with AI assistance (Claude). Computed only; no rod or part was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-alusearch/

**Builds on.** `selfrep-alurod` (rod bookkeeping), `selfrep-rodbeam` (beam model), `selfrep-redesign` (substitution search) and `selfrep-closure` (RepRap-class bill of materials from the RepRap wiki; RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). Beam theory is textbook Euler-Bernoulli bending. It builds on none of the labs in `prompt.md`.

## Method
- The decision space is one rod choice (keep steel rods as vitamins; hardwood or aluminium bar at 8, 10 or 12 mm) times all 2^6 subsets of `selfrep-redesign`'s other six substitutions: 448 designs, searched exhaustively.
- The rod's penalty is `min(1, K * log2(1 + sag / sag_steel_8mm))` with K = 0.25. **This formula and K are my assumptions**, chosen so an 8 mm steel-equivalent rod costs 0.25 and a very floppy rod saturates at 1. Sag comes from `selfrep-rodbeam` (5 N, 420 mm rod, assumed moduli). The other six penalties are `selfrep-redesign`'s assumed values.
- Objective: closure (mass, cost or lines) of the printer + router + laser shop, as in `selfrep-redesign`. Comparison: `selfrep-redesign`'s own search (its assumed 0.9 / 30 g wood rod). A random-search baseline (8 evaluations) is run on the joint space, and K is varied from 0.05 to 1.
- The comparison with `selfrep-redesign` mixes two changes (an aluminium option, and mass computed from geometry rather than 30 g per dowel); it is not an isolated effect of the aluminium option.

## Reproduce
```bash
cd research/selfrep-alusearch
python3 -m unittest discover -s tests -v     # 7 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- Rod penalties at K = 0.25: aluminium 0.49 / 0.28 / 0.16 at 8 / 10 / 12 mm; hardwood 1.00 / 0.80 / 0.58.
- With the aluminium option the best mass-closure design at every budget from 0.5 up uses the 12 mm aluminium rod: 37.6% at budget 0.5 (printed M8 nuts only), 40.0% at 2.0 and 41.4% at 4.0 (all substitutions). `selfrep-redesign` reaches 25.0%, 33.1% and 35.8% at the same budgets. The gap is largest at small budgets (12.6 points at 0.5) and 5.6 points at the full budget.
- Cost and line closure move less: at budget 2.0, cost closure is 46.1% against 44.9% and lines closure 56.2% against 53.1%. At budget 4.0 the cost and lines results equal `selfrep-redesign`'s (47.7%, 60.4%).
- The 12 mm choice sits at the edge of the assumed holder limit. It is probably chosen because the closure metric counts bar stock as makeable, so heavier is better, which `selfrep-rodbeam` and `selfrep-alurod` already flagged as a flaw of the metric; here it makes the penalty-vs-mass trade run to the bound, so the pick says little about the best rod.
- Robustness: across K = 0.05 to 1.0, the mass-closure optimum stayed on the 12 mm aluminium rod at budgets 1, 2 and 3; the closure value moved by at most 1.1 points (38.7% to 37.6% at budget 1).
- Random search with 8 evaluations on the 448-design space reached 27.4%, 36.1% and 38.1% at budgets 1, 2 and 3, against 38.7%, 40.0% and 41.1% exhaustive.

## Limitations
- Stylised throughout. The sag-to-penalty mapping is invented; there is no print-quality or vibration model behind it. The six other penalties remain arbitrary. Only three diameters and two materials are tried.
- Aluminium bar cut on a router with a bearing-grade surface is optimistic (see `selfrep-alurod`). Cost and price of aluminium are not modelled.
- Closure counts imported stock as makeable, so the search favours heavy parts; the closure gain is not evidence of a better machine.
- Exhaustive search over 448 designs is cheap, so the greedy and random comparisons only show the problem's shape. No proposer (LLM or CMA-ES) is used.

## Next steps
Replace the log-sag penalty with one derived from a ringing/vibration model (`selfrep-rodmodes`, `selfrep-alufreq`); change the closure metric to count imported stock so that heavier is not better; add a router-cut aluminium extrusion frame.

## Owner steps
- Bend-test an aluminium bar and a steel rod, and print with deliberately soft rods, to replace the assumed penalty curve with measured print quality against sag.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-alurod`, `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure` source trees (relative paths). Aluminium bar, steel rod and dowel are imported, not made by the shop; motors, electronics, threaded rods and the hot end remain vitamins in every design.
