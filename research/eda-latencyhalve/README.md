# eda-latencyhalve: how many SKY130 mappings does a generic-gate screen need to find the best area × latency design? (follow-up to `eda-sky130rung`, track 7)

Why it seemed worth doing: `eda-sky130rung` found that generic-gate cell count ranks SKY130 area almost perfectly (Spearman 0.995) but generic logic depth ranks the mapped clock-period model poorly (0.611). It left "feed the mapped objective back into the search" open. A loop does not need a good global ranking, it needs the best design to be near the top of the cheap rung's list, because that list decides which designs get the expensive mapping. This asks that directly, with the mapped objective as the truth. Produced with AI assistance (Claude). **Preliminary:** one design family, one ABC script, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-latencyhalve/

**Builds on.** `research/eda-sky130rung` (its committed `mapped.json`, copied to `experiments/mapped.json`: 40 MAC-engine designs with generic cells, depth, cycles, SKY130 area and ABC critical-path delay; Yosys 0.33, SKY130 HD `tt_025C_1v80` at ORFS `e5cc6e799f`), `research/eda-harness` and `research/chip-accel` (the designs), `research/eda-fidelity` (the screen-then-promote framing and the analytic rung; the idea is multifidelity screening, Peherstorfer, Willcox and Gunzburger 2018, *SIAM Review* 60(3):550-591). No code is copied; the screen code is original.

## Method
- Truth, three mapped objectives (minimised): area × cycles, area × latency, and latency, with latency = cycles × ABC delay.
- Three screens, each needing no mapping: the analytic `p·wb²·ceil(110/p)` (free), generic `cells × cycles` (needs synthesis), and generic `cells × cycles × depth` (a clock-aware generic proxy).
- A screen ranks a pool and the top k are mapped; we report where the true best sits in each order (A), the best true value among the top k over all 40 designs (B), and, over 5,000 random pools of 20 designs, the probability the pool's true best is among the top k (C, D). Random choice maps k of 20 designs, probability k/20.
- `src/eda_latencyhalve/screen.py` (stdlib only); tests check ordering, tie breaks, a brute-force enumeration of the capture probability on a four-design toy, and a textbook Wilson interval (50 of 100 gives 0.404 to 0.596).

## Reproduce
```bash
cd research/eda-latencyhalve
PYTHONPATH=src python3 -m unittest discover -s tests
PYTHONPATH=src python3 experiments/run.py && python3 experiments/figure.py   # seconds, stdlib only
```

## Results (`experiments/results.txt`)
- **The generic screen puts the best design first on this family.** For all three mapped objectives the best design is p4w4, rank 1 in the `cells × cycles` order and in the depth-aware order; the analytic rung puts it fifth.
- **Over random pools of 20, mapping 3 designs captures the pool's best 0.970 of the time** with generic `cells × cycles` (Wilson 95% interval 0.965 to 0.975, against 0.15 for random choice), 0.987 with the depth term, 0.542 with the analytic rung alone. At k = 1 the numbers are 0.633, 0.636 and 0.140. Mapping 5 reaches 0.996 and 1.000 for the generic screens.
- **The price of stopping early is small.** With one mapping the picked design's area × latency is on average 1.078 times the pool optimum (1.072 with depth, 1.414 analytic); at k = 3 it is 1.0011 (1.0003; 1.105).
- **Consequence for `eda-sky130rung`'s finding.** The poor depth-to-delay rank correlation (0.611) did not stop the screen finding the best design, because the top of the list is dominated by cells and cycles. Adding depth helped only at the margin (0.970 to 0.987 at k = 3). The designs the generic screen would map first have true area × latency ranks 1, 6, 3, 2, 14, 9, 4, 7: the list is not sorted, but it holds the winner within the first few.
- Figure: `experiments/capture.svg`.

## Limitations
- One family (p lanes × wb bits of one MAC engine) and 40 points, so the pools overlap heavily. The Wilson intervals reflect only the 5,000 random draws, not variation across design families; with 40 designs the real uncertainty is larger and unquantified.
- The truth is itself a model: ABC `map` delay with no wire load, placement or clock-tree terms, and one script (`dc2; map`). A post-route truth could reorder the top designs, and OpenROAD is not installed here.
- The best design sits at the low-area, low-wb corner, where the generic cost is also small. A family whose optimum is a large design may be harder for the screen. `eda-flowtune`'s eight designs and `chip-systolic` are the natural tests.
- Costs are counts of mappings, not seconds: the mapping time per design was not recorded in `mapped.json` (the `eda-sky130rung` README gives about 2 to 30 s each), so no tool-seconds saving is claimed. The screens that need synthesis also cost a synthesis each; only the analytic rung is free.
- Open-flow numbers are estimates, not sign-off results, and say nothing measured about silicon.

## Next steps
Repeat on `chip-systolic` and `eda-flowtune`'s designs; record mapping seconds and report tool-seconds saved; replace the single-objective truth with a Pareto-front capture rate (how many of the true front's designs fall in the top k); add a post-route truth when OpenROAD is available.

## Owner steps
None.

## Outside dependencies
None beyond the Python standard library (the dataset is committed; it came from Yosys 0.33 and ABC in `eda-sky130rung`). All code original, MIT.
