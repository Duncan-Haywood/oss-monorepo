# eda-rankpayoff: does a cheap rung's rank correlation with the expensive rung predict how well it works as a top-k screen?

Why it seemed worth doing: the `eda` track's projects (`eda-sky130rung`, `eda-delayproxy`, `eda-screen`) score a cheap proxy by its Spearman rank correlation with the mapped (SKY130) result, and `eda-delayproxy` ends by noting that its best-correlated proxies still miss designs on the true front. A search loop never uses the whole ranking: it maps the proxy's top *k* and keeps the best. So is the number everyone reports the right one to optimise? This asks a new question of the track's data instead of another proxy. Produced with AI assistance (Claude). **Preliminary:** one design family, one ABC script, no place and route, so nothing here is sign-off or silicon.

**Headline.** It depends on the truth the loop optimises. For mapped **area × latency**, rank agreement and screening payoff go together across 207 screens (Spearman 0.60 with the chance the first mapping finds the pool's best; bootstrap 0.50 to 0.68). For mapped **latency alone** they do not (−0.13, −0.26 to 0.02): the highest-Spearman screen (0.958) maps the pool's best design first only 32% of the time, gate count (Spearman 0.551) 69%, and 14 of the 175 screens that rank at ≥ 0.9 do not put the truly best design in their top 3.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-rankpayoff/

**Builds on.** `research/eda-latencyhalve` (its committed `mapped.json`: area, cycles, generic cell count and depth per design; the top-*k* capture protocol), `research/eda-delayproxy` (its committed `proxies.json`: fan-out, logical-effort and other delay proxies and 200 type re-weightings), `research/eda-sky130rung` (the mapped data), `research/eda-harness` and `research/chip-accel` (the 40 MAC-engine designs). The multi-fidelity screening idea is from Peherstorfer, Willcox and Gunzburger (2018), *SIAM Review* 60(3):550-591. No code is copied; no CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Truth, two mapped objectives (minimised): area × latency and latency, latency = cycles × ABC critical-path delay (Yosys 0.33, `strash; dc2; map; topo; stime`, SKY130 HD `tt_025C_1v80`, ORFS `e5cc6e799f`).
- 207 screens per truth, each needing no mapping: the base (generic cells × cycles for area × latency, cycles for latency) alone; the base times each of six `eda-delayproxy` delay proxies (unit depth, gate-type weights, fan-out model, logical effort with real fan-out, largest fan-out, gate count); and the base times each of 200 random per-gate-type scalings (log-uniform 0.5 to 2) of the logical-effort delay.
- Per screen: Spearman and Kendall (τ-b) agreement with the truth over the 40 designs, overlap of the best 5, the 1-based position of the truly best design in the screen's order, and, over 5,000 random pools of 20 designs, the probability that the pool's best is among the screen's top *k* (*k* = 1 and 3) and the mean ratio of the picked value to the pool's best at *k* = 1. Then the Spearman correlation across screens between each agreement figure and each payoff, with a 2,000-resample bootstrap over screens.
- `src/eda_rankpayoff/rank.py` (stdlib only). Tests check Spearman and Kendall against Wikipedia's textbook example (ρ = −29/165, τ = −5/45), tie handling, and the capture probability against a full enumeration of the pools of a five-design toy. `experiments/build_data.py` joins the two committed sources into `experiments/data.json` and asserts the delays and depths agree.

## Reproduce
```bash
cd research/eda-rankpayoff
PYTHONPATH=src python3 -m unittest discover -s tests
python3 experiments/build_data.py                                # optional: rebuilds data.json from the two sources
PYTHONPATH=src python3 experiments/run.py && python3 experiments/figure.py   # about 2 minutes each, stdlib only
```

## Results (`experiments/results.txt`, figure `experiments/scatter.svg`)
- **Check against the source.** For area × latency the base screen (generic cells × cycles) gives P(best mapped) 0.636 at *k* = 1 and 0.970 at *k* = 3, and a mean ratio of 1.078: the figures `eda-latencyhalve` reports for the same screen, reproduced by independent code.
- **Area × latency: agreement and payoff go together, loosely.** Across the 207 screens Spearman correlates with P(best at first mapping) at 0.60 (0.50 to 0.68), Kendall 0.59, top-5 overlap 0.70. All 200 re-weighted screens agree at 0.93 to 0.98 and put the best design first or second; the gap is in how often the first mapping is already the best (0.49 to 0.81).
- **Latency alone: they do not.** Spearman against P(best at *k* = 1): −0.13 (−0.26 to 0.02); Kendall −0.04; top-5 overlap 0.43. Named screens: depth (0.931) and gate-type weights (0.936) rank as well as the fan-out model (0.937), but put the best design 5th and 6th while the fan-out model puts it 2nd (P at *k* = 3: 0.589, 0.504 against 0.948). Gate count ranks latency at only 0.551 yet puts the best design first (0.692 at *k* = 1, the best of the named screens).
- **The measure that does predict is the one a loop cannot see.** The rank of the best design in the screen's order correlates at 0.90 (0.87 to 0.92) with P(best at *k* = 1) for latency, but that rank needs the mapped truth; it is the quantity being searched for. In the area × latency case it is nearly constant (1 for 204 of 207 screens), which is why it correlates at only 0.21 there.
- **Practical reading.** When a screen is to pick *k* designs to map, report how often the top *k* contains the best on pools or held-out designs, not (only) Spearman. Where the objective is dominated by a smooth size term (area × latency here), Spearman is a fair guide; where the winner is decided at the extreme of a noisy quantity (latency), it is not.

## Limitations
- One design family (lanes × bits of a MAC engine) from one generator and one ABC script, 40 points, and one winning design (p = 4, 4 bits) for both truths. "Best rank" and "P(best)" are therefore driven by where that one design falls, and the correlations across screens would differ on a family with a different structure. No claim beyond this family.
- The 200 re-weighted screens are variants of one model, so they are correlated; the bootstrap over screens treats them as independent and its intervals are optimistic. The named screens (7 per truth) are too few for a separate correlation.
- The truth is ABC's `stime` on a mapped netlist with no wires, placement or clock tree; a post-route truth could change which design is best. Open-flow numbers are estimates, not sign-off results.
- The base screens for the two truths differ (cells × cycles vs cycles), so the two truths are not a controlled comparison of the same screens.
- Pools are drawn from the 40 designs that the screens were examined on; nothing is held out. Capture probabilities carry Monte Carlo noise of about ±0.007 (5,000 draws).

## Next steps
Repeat on a family with several near-best designs (`eda-flowtune`'s eight designs, the `chip-systolic-*` arrays) where the winner is not unique; fit a screen directly on top-*k* capture instead of on rank loss; test whether the same split appears when the truth is a post-route delay.

## Owner steps
None.

## Outside dependencies
None beyond the Python standard library (the data is committed; it came from Yosys 0.33 and ABC in `eda-sky130rung`). All code original, MIT.
