# robofab-settle: does a quasi-static support rule agree with MuJoCo settle tests? (a validation of `robofab-sequence`)

Python with MuJoCo. Every one of the 2^11 = 2,048 partial assemblies of the twelve-part printed gearbox from [`robofab-sequence`](../robofab-sequence) is dropped into MuJoCo in its final pose, with the base fixtured and the other parts free bodies, and left to settle for 1 s. A state "holds" if no part moves 3 mm or tilts 3 degrees. That is compared with that project's L1 quasi-static support rule. All numbers are from `experiments/results.txt`.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-settle/

- **The L1 rule agrees with MuJoCo on 1,957 of 2,048 states (95.6%)**: 244 hold in both, 1,713 fail in both. The 91 disagreements are of two kinds.
- **81 states the rule accepts but MuJoCo topples** (7.7 mm, 8.8 degrees in the example `wall_back + shaft1 + collar_f1`). Cause found by inspecting the rule: a part can count as resting on a part that rests on it. The front collar sits on the shaft, yet the collar's lowest box lies within the 1 mm settle gap below the shaft and is counted as a support patch for it. The bounding rectangle of that patch and the back-wall patch then covers the shaft's centre of mass. An acyclic variant (`grounded_stable`: a part is supported only by already-grounded parts) removes all 81.
- **10 states the rule rejects but MuJoCo holds** (0.9 mm, 0.8 degrees in `gear1 + shaft1 + collar_f1`). The shaft's centre of mass lies outside its only support patch, but the 8 mm gear bore, with 0.5 mm clearance per side, keeps it from tipping. The rectangle rule has no notion of such capture. These stay with the acyclic variant, which agrees on 99.5% (2,038 of 2,048).
- **The count of valid assembly orders does not change: 30,760 under the L1 rule, the acyclic variant, and MuJoCo settle at each of three friction coefficients (0.2, 0.5, 0.8)**, with the same 244 reachable states and the same minimum of 1 direction change. The 91 disagreeing states are not on any complete valid order, so for this product the conclusions of `robofab-sequence` survive the physics check. That is a result about this one product, not a general guarantee.
- Friction made no difference to any verdict (the confusion table is identical for 0.2, 0.5 and 0.8). The settle thresholds matter little: 2 to 5 mm give the same table; allowing 10 degrees instead of 3 moves 7 more states into the "MuJoCo holds" column.

```bash
cd research/robofab-settle
pip install mujoco numpy
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                 # ~2.5 min on 4 cores; output in experiments/results.txt
```

## Motivation

`robofab-sequence` found that its quasi-static support rule (L1) prunes 99.3% of the collision-free assembly orders, and listed "validate the support rule against MuJoCo settle tests" as the first next step. This is that step: the repository's sim-fidelity theme applied to a hand-written checker, using a physics engine as the more faithful model.

## Builds on

`research/robofab-sequence` (this repository), whose geometry, insertion checker and support rule are imported unchanged (`src/robofab_settle/settle.py` adds `../robofab-sequence/src` to the path, so both directories must move together). The direction follows the task-and-motion-planning and workcell-twin interests of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). Nothing here reproduces a specific paper from either lab, and nothing here is affiliated with or endorsed by them.

Physics engine: Todorov, Erez and Tassa (2012), "MuJoCo: A physics engine for model-based control", IROS, <https://doi.org/10.1109/IROS.2012.6386109> (cited in `PROJECTS.md`, checked there on 2026-10-12; this run had no web access to re-verify). Software: the `mujoco` Python package, version 3.15.0 here (Apache-2.0).

## Method

- **Model.** Each part is one MuJoCo body made of its box geoms, in metres, density 1,240 kg/m^3 (PLA-like, stylised, not measured), sliding friction `mu` in {0.2, 0.5, 0.8}, default contact parameters, time step 0.5 ms, gravity -z. The base is fixed to the world; every other placed part is a free body.
- **Settle test.** Simulate 1 s from the final poses. Holds if the largest displacement of any body's centre of mass is under 3 mm and the largest rotation under 3 degrees. A 3 mm threshold is needed because the product models each shaft 1 mm above its hole floor, so a correct state moves about 1 to 1.6 mm when it drops.
- **States.** All 2,048 subsets of the 11 non-base parts. All of them are reachable by collision-free insertions (L0), so the comparison covers every state an order could pass through.
- **Orders.** The exact subset DP of `robofab-sequence` is re-run with the stability test replaced by each alternative.

## Results

See the bullets at the top and `experiments/results.txt` (confusion tables per friction and threshold, the first twelve disagreements, and the order counts).

## Limitations

Stylised. One product, boxes only. The test is static: parts start in their final poses and are released at once; it does not simulate the insertion motions, a gripper, or press and snap fits, so it cannot say whether a held state can be reached. One second of simulation may miss slow creep, and the verdicts depend on the thresholds and on MuJoCo's default contact softness, which were not tuned or compared with other engines. Friction having no effect says the verdicts are decided by geometry and gravity in this model, not that friction is irrelevant for real printed parts. The acyclic variant was designed after seeing the failures, so its 99.5% agreement is on the same states used to find the problem, not a held-out test. Nothing is a claim about a physical assembly.

## Next steps

Simulate the insertion motions themselves (with a gripper) instead of static release; replace boxes with meshes; try a second product so the acyclic fix is tested on states it was not designed on; add the bore-capture effect to the rule or use the settle test directly inside the planner; move on to `robofab-program` (checking LLM-written robot programs in a twin).

## Owner steps

None; nothing was built or ordered. A physical build would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip). No language model, key, or hardware was used. Produced with AI assistance (Claude).

MIT.
