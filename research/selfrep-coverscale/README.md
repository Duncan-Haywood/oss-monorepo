# selfrep-coverscale: does greedy substitution search still work when the printer-redesign list grows past seven items?

Track 1 (`PROJECTS.md`). The last dozen `selfrep-*` projects re-ran one printer model with new assumed inputs; this one asks a different question of the search itself. `selfrep-redesign` found greedy gain-per-penalty within 2.5 points of exhaustive on seven substitutions, but 2^7 subsets is too small to say anything about larger lists, and its substitutions never competed for the same vitamin line. Produced with AI assistance (Claude). Computed only, on **synthetic** instances; no real bill of materials is used.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-coverscale/

**Builds on.** The search in `selfrep-redesign` and the greedy-vs-exact method of `selfrep-nextmachine`. It builds on none of the labs in `prompt.md`.

## Method
- Budgeted weighted coverage: substitution *i* has a penalty (U[0.3, 0.9]) and covers 1 to 3 of the vitamin lines (2n/3 lines, log-normal weights); pick substitutions within a penalty budget to maximise covered weight. **The generator, the weights and the budget (25% of total penalty) are my assumptions.** An `overlap` knob sends covered lines to the "popular" third of lines, so substitutions compete.
- Exact optimum by branch and bound (checked against brute force in the tests). Compared: greedy marginal-gain-per-penalty, greedy plus best single item, hill-climbing local search (add/swap moves, 5 restarts), and best of 64 random feasible subsets.
- n = 7, 12, 18, 24; overlap 0, 0.5, 0.9; 100 instances per row, seed 0.

## Reproduce
```bash
cd research/selfrep-coverscale
python3 -m unittest discover -s tests -v     # 5 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt (about 2 minutes)
python3 experiments/figure.py                # plots experiments/ratio_vs_n.svg from the committed results.txt
```

## Results (from `experiments/results.txt`)
- Greedy stays within about 1 to 3% of the optimum on average at every size tried (mean 96.3% to 99.9% of optimal), but it is exactly optimal in only 33 to 95 of 100 instances, and its worst case is 49.6% at n = 7, overlap 0.9 and 87 to 98% at n = 18 and 24.
- Heavy overlap helps greedy: at overlap 0.9 it is optimal in 91 to 95 of 100 instances, because most substitutions cover the same few lines and the budget only buys a few.
- From n = 12 up, local search has the best mean at overlap 0 and 0.5 (99.4% to 99.7%; at overlap 0.9 it ties greedy), but its worst case is poor at n = 7 (13.6% at overlap 0.9: with a tiny feasible set, five restarts can all stall).
- Random search with 64 evaluations is perfect at n = 7 (it nearly enumerates the space) and falls to about 89 to 90% at n = 24 for overlap 0 and 0.5 (97% at 0.9), so the "random-search baseline" used in earlier projects flatters itself on small lists.
- The best-single-item fix matters only at n = 7 (greedy 96.3% to 98.2% becomes 98.8% to 100.0%); from n = 12 greedy and greedy+single coincide here.

## Limitations
- Synthetic instances: nothing here says anything about the real Prusa Mendel list, whose substitutions overlap in ways nobody has measured. Additive penalties and a coverage objective are simplifications (closure in `selfrep-closure` is a ratio over a shop, not a sum).
- 100 instances per cell; ratios of means, not confidence intervals. Budget fixed at 25%; other budgets not run.
- Branch and bound was only run to n = 24.

## Next steps
Re-run the n = 7 row on the real `selfrep-redesign` list with each substitution widened to alternatives (several nut or bearing designs per line), to see whether real overlap looks like overlap 0.5 or 0.9.

## Owner steps
None: no hardware is involved.

## Outside dependencies (vitamins)
Python standard library only.
