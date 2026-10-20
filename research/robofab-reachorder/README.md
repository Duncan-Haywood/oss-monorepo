# Does the assembly order change the arm an arm needs to build its own gripper? Order search combined with reach (negative result)

Pure Python, no dependencies. Combines `research/robofab-selfparts` (384 valid assembly orders of a seven-part toy gripper for a side-approach parallel-jaw arm, 30 mm jaw) with `research/robofab-reach` (a two-link turntable arm that must reach a pick, place and lift point per part). The coupling: each part's lift point is `clear` mm above the tallest thing already assembled (including the part), so lift heights depend on the order. All numbers come from `experiments/results.txt`. Milestone follow-up of the `robofab` track, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-reachorder/

- **Negative result.** For all 384 valid orders the shortest arm (equal links, l1 on a 10 mm grid, base on a 20 mm grid) is identical, for clearances of 0, 10, 30 and 60 mm: 80 mm at shoulder height 100 mm and 120 mm at 200 mm (tray gap 120 mm).
- **Wider sweep, same outcome.** Tray gaps 0, 40, 120 mm with clearances 30, 120, 250 mm (H = 100 mm): best equals worst each time (60, 70, 80 mm at the small clearances; 90, 90, 100 mm at 250 mm).
- **Why (my reading, not separately tested).** The cover, 24 mm tall at the top, has the highest lift point whatever the order, and the tray distance sets the horizontal extent. Orders only move the lift points of earlier parts, which are never binding. The 27 distinct target sets across orders differ, but not in a way that changes the minimum.

```bash
cd research/robofab-reachorder
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 5 tests, ~2 s
PYTHONPATH=src python3 experiments/run.py                 # a few minutes; output in experiments/results.txt
```

## Motivation

`robofab-reach` left "combining reach with the assembly-order search" as a next step. If order mattered, a planner could pick an order that lets a smaller (printable) arm do the job.

## Builds on

Task-and-motion-planning and workcell directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from either lab is reproduced; nothing here is affiliated with or endorsed by them. Extends this repository's `robofab-selfparts` (`assembly.py` is a verbatim copy of its model) and `robofab-reach`. Context: Tian et al. (2024), "ASAP: Automated Sequence Planning for Complex Robotic Assembly with Physical Feasibility", ICRA, <https://doi.org/10.1109/ICRA57147.2024.10611595> (cited from `PROJECTS.md`, not re-verified: no web access in this run). Two-link inverse kinematics is the standard law-of-cosines solution.

## Method

`reachorder.py`: `valid_orders` enumerates every order the selfparts model accepts; `order_targets` builds the wrist targets for an order (pick in a tray row, place at the part's final box centre, lift at max(top of assembled parts and own top) + clearance); `min_link` finds the smallest l1 (l2 = l1) with some base position reaching all targets. Results are cached per distinct target set.

## Limitations

Stylised. Wrist point only; no joint limits, link collision, wrist orientation, payload or tray-order choice (the tray slots are fixed per part). Only one clearance rule couples order to reach; other couplings (a part blocking the arm's path, re-grasping, tray assignment per order) might make order matter and were not tried. Link grid 10 mm, base grid 20 mm, so differences below that are invisible. Simulated results are not claims about physical arms.

## Next steps

Let tray slots be assigned per order, add link-versus-part collision (so assembled height blocks the arm's approach), and use joint limits from `robofab-reach`.

## Owner steps

Printing and testing on a low-cost open arm such as the SO-101 is the owner's call; no prices were verified in this run, so no bill of materials is given.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
