# Which assembly orders survive a better checker? Exact sequence planning for a printed gearbox, with a stylised collision-and-support checker

Pure Python, no dependencies. A twelve-part printed gearbox (fixtured base, two walls, two gears, two shafts, four collars, a lid; boxes in millimetres, dimensions chosen for this study) is assembled one part at a time, each by a straight-line move along ±x, ±y or ±z. A dynamic programme over subsets of placed parts counts every valid order exactly and finds the order with the fewest insertion-direction changes (a stand-in for re-grasps and tool re-orientations). Everything is checked at three fidelity levels: **L0** collision-free insertion only; **L1** adds quasi-static support (every placed part must rest on placed parts below it, its centre of mass above the bounding rectangle of its support patches); **L2** adds a print-tolerance gap. All numbers below come from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-sequence/

- Of the 11! = 39,916,800 orderings of the non-base parts, **4,227,168 (10.6%) pass L0 and 30,760 (0.077%) pass L1**: L1 rejects 99.3% of the L0-valid orders. A random permutation is valid at L1 in 71 of 100,000 draws against an exact 77 per 100,000 (consistent with sampling noise: about 77 ± 9 expected).
- The fewest direction changes is 1 at both L0 and L1. But the order that is optimal at L0 (tie-broken by part index) is **invalid at L1**: it places a front collar before its shaft, so the collar has nothing to rest on. A greedy assembly-by-disassembly order (remove the first removable part, no backtracking) is valid at L1 but needs 4 direction changes; a random walk over valid steps averages 3.46 (range 1 to 6, 2000 walks); the optimum is 1.
- The one-attempt order written by the session agent (`proposals/session_agent_1.json`, written before the checker or planner were run, 12 parts in the order base, gears, back wall, front wall, shafts, collars, lid) passes L0, L1 and L2 with 2 direction changes. This is **one attempt by the session agent, not a reproducible LLM benchmark**, and says nothing about how often a language model would produce a valid order.
- The tolerance sweep is a cliff, not a curve: valid orders are unchanged for gap tolerances 0 to 0.5 mm and fall to zero at 0.6 mm. The cliff sits at 0.5 mm only because the smallest bore clearance in the model was set to 0.5 mm per side; it shows how a checker's tolerance interacts with chosen clearances, not anything about real printers. Likewise the support-gap sweep (a part counts as resting if the gap below is at most the setting) gives 0 valid orders at 0, 0.25 and 0.5 mm and 30,760 at 1 and 2 mm, because the shaft is modelled 1 mm above its wall-hole floor.

```bash
cd research/robofab-sequence
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, ~2 s (includes brute-force enumeration of all valid orders)
PYTHONPATH=src python3 experiments/run.py                 # ~2 s; output in experiments/results.txt
```

## Motivation

A robot arm that assembles a product needs an order in which every step is physically possible. Whether a candidate order is feasible depends on how faithful the checker is, which is the repository's sim-fidelity theme: a collision-only checker accepts orders that a checker with gravity rejects. This is milestone 1 of the `robofab` track: plan the order by assembly-by-disassembly and compare it with an order proposed by an LLM-style proposer, both scored by the same checker.

## Builds on

The task-and-motion-planning and learning-from-demonstration directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the workcell-twin and manipulation directions of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No specific paper from either lab is reproduced and nothing here is affiliated with or endorsed by them.

Related published work, cited for context and not reproduced: Tian et al. (2024), "ASAP: Automated Sequence Planning for Complex Robotic Assembly with Physical Feasibility", ICRA, 4380-4386, <https://doi.org/10.1109/ICRA57147.2024.10611595>, which also plans assembly sequences with physical feasibility in mind; this project is a much simpler, axis-aligned geometric checker built from scratch and is not a reimplementation of it. Liang et al. (2023), "Code as Policies", ICRA, <https://doi.org/10.1109/ICRA48891.2023.10160591>, motivates the language-model proposer in the loop. Todorov, Erez and Tassa (2012), MuJoCo, IROS, <https://doi.org/10.1109/IROS.2012.6386109>, is the physics engine a next step would use to validate the support rule. Citations were taken from `PROJECTS.md` (checked there on 2026-10-12); this run had no web access to re-verify them.

## Method

- **Parts.** Unions of axis-aligned boxes (`src/robofab_sequence/product.py`); holes are made from boxes around a gap. The base is fixtured.
- **Insertion.** Part `p` can be added to the placed set `S` along direction `d` if, moving from its final pose to infinity along `d`, it does not sweep through positive volume of any part in `S`. Faces that exactly touch slide past each other; with tolerance `tol`, a gap across the motion smaller than `tol` blocks.
- **Support (L1).** After each placement every non-base part needs at least one support patch (a box of a placed part lying below one of its boxes, within a settle gap of 1 mm) and its centre of mass (uniform density) must lie over the bounding rectangle of its patches. That rectangle can exceed the true convex hull of the patches, so the rule can accept states a physical engine would topple. It also ignores friction, press-fits, snap-fits and anything held by a gripper.
- **Search.** Dynamic programme over the 2^11 subsets of placed parts, counting orders and minimising direction changes with the last direction as extra state (`planner.py`). Tests compare both against a memo-free enumeration of all 30,760 valid orders.
- **Baselines.** Random permutations, a random walk over valid steps, and greedy assembly-by-disassembly (no backtracking). There is no learned or LLM proposer other than the one session-agent attempt.

## Results

See the bullets at the top and `experiments/results.txt`. The white paper in `paper/whitepaper.md` gives the discussion.

## Limitations

Stylised. Boxes only, straight-line single-part moves along the axes, no subassemblies, no grippers or reachability, quasi-static support only, no friction or fits, a single product whose dimensions were chosen for the study. The fidelity ladder compares three levels of the same hand-written checker; it is not a comparison with a physics engine and says nothing about real printed parts or a real arm. Counts of "valid orders" depend on the modelled clearances (see the sweeps). Direction changes are a crude proxy for re-grasp cost. Simulated results are not claims about real systems.

## Next steps

Validate the support rule against MuJoCo settle tests, add subassemblies and gripper access, replace the box geometry with meshes, and move on to milestone 2 (`robofab-insert`, learned insertion with domain randomisation).

## Owner steps

None for this milestone: nothing was fabricated or ordered. A physical build would need printed parts and a bill of materials with sourced, dated prices; none are given because no prices were verified in this run.

## Outside dependencies

None at run time (Python standard library only). The study could not check any result against a physical assembly or a physics engine. Produced with AI assistance (Claude); the session agent also acted as the proposer for the single proposal above.

MIT.
