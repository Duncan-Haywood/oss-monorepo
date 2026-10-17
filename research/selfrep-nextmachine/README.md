# selfrep-nextmachine: which machine should a seed shop add next? Greedy rule vs exhaustive search

Second milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). Given the RepRap Prusa Mendel part model of [`selfrep-closure`](../selfrep-closure), it chooses which machines (CNC router, laser cutter, casting setup) to add to a printer-only shop under a budget, and checks a greedy rule against exhaustive search. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-nextmachine/

**Builds on.** `research/selfrep-closure` (imported, not copied) and, through it, the RepRap Prusa Mendel bill of materials (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>; wiki page cited there). The framing is von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- A machine adds one process to the shop; the printer (`fdm`) is always present. A part is makeable under the closure model's rules (some process in the shop, or both `cast` and `cnc` for brass bushings).
- Objective: closure (by part lines, mass or cost) of the Prusa Mendel for the resulting shop.
- **Exhaustive**: every affordable subset of machines (ties: cheaper first).
- **Greedy**: repeatedly buy the affordable machine with the best marginal closure per price, until none has a positive marginal gain.
- Synthetic check: 500 random instances (8 machines, 40 weighted parts, 6 processes, each part needs all processes of one of one or two alternative sets), same two methods.

## Reproduce
```bash
cd research/selfrep-nextmachine
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- **Real instance (three machines).** Greedy and exhaustive pick the same machines at every tested budget (0 to 1700), for every objective and both bearing variants. With budget 600 the laser cutter is best (35.3% to 37.3% of lines); with 800 the router (43.1%); with 1100 and brass bushings, router plus casting (45.1% of lines, 24% of mass, 21% of cost). With LM8UU bearings nothing beyond the router adds closure.
- Casting alone adds nothing with brass bushings (they need `cast` and `cnc` together), so a purely myopic rule looks blind to it. Greedy still gets there on this instance because buying the router first makes casting's marginal gain positive. With three machines that is luck of ordering, not a general property.
- **Synthetic instances.** Greedy matches the optimum in 72% (budget 1000), 76% (2000) and 94% (3000) of instances where some machine helps. Mean greedy/optimal gain is 0.966, 0.980 and 0.997; the worst case is 0.619 at the smallest budget. So the simple rule is usually near-optimal and can lose a third of the gain when processes are complements or the budget is tight.
- Exhaustive search is trivial here (2^n subsets); an integer program only matters beyond ~20 candidate machines, and none was needed.

## Limitations
- **Stylised.** Machine prices (router 800, laser 600, casting setup 300) are **assumed placeholders**, as are the part masses and costs inherited from `selfrep-closure`; no price is sourced. The ranking router > laser at a given budget depends on these assumptions and on which processes the closure model lets make which part.
- Only three real candidate machines, so the real-instance agreement of greedy and exhaustive is weak evidence; the synthetic instances are random, not drawn from real shops.
- Machines have no bill of materials of their own and no build time, so "closure per dollar" ignores what it costs to make the machine itself. That is the next step.
- Objective is closure of a single product (the printer), not growth.

## Next steps
Give the router, laser cutter and caster their own bills of materials so machines are themselves products to close; then `selfrep-growth` (discrete-event growth with vitamin imports).

## Owner steps
Replace the assumed machine prices with dated quotes (source and date for each) and re-run `experiments/run.py`.

## Outside dependencies (vitamins)
Python standard library only. The model's own vitamins (motors, electronics, rods, bearings, fasteners) are those listed in `selfrep-closure`.
