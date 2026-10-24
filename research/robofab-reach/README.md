# How long an arm does it take to assemble its own toy gripper? Reach and joint limits in a planar two-link model

Pure Python, no dependencies. A follow-up to `research/robofab-selfparts`, which asked whether a parallel-jaw arm can *grip and place* every part of a seven-part toy gripper and left reach as a next step. Here a two-link arm on a turntable base (vertical-plane inverse kinematics in radial distance and height) must bring its wrist point to three targets per free part: a pick point in a tray row, the place point (centre of the part's final box) and a lift point 30 mm above the part. The base may stand anywhere on the table (10 mm grid); the question is the shortest link length for which some base position reaches all 18 targets. All numbers below come from `experiments/results.txt`. Simulation only; milestone 5 follow-up of the `robofab` track.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-reach/

- **Tray distance and shoulder height drive the answer.** With equal links (l1 = l2) and no joint limits, the shortest arm at a shoulder height of 100 mm is 60 mm (tray 40 mm from the fixture), 80 mm (120 mm), 100 mm (240 mm) and 140 mm (400 mm). Raising the shoulder to 300 mm raises these to 150, 160, 170 and 200 mm: the targets are all low, so a high shoulder mostly costs reach.
- **An elbow limit matters sharply.** At tray gap 120 mm and H = 100 mm, limiting the elbow bend to 120 degrees or more leaves the 80 mm answer unchanged; at 90 degrees it rises to 180 mm; at 60 degrees no arm up to 600 mm works.
- **Link ratio changes total length little.** Total length (l1 + l2) is 150 mm for ratios 0.5, 1.5 and 2.0, 157.5 mm for 0.75 and 160 mm for 1.0, within the 10 mm length grid used.
- **Shoulder elevation limited to 0 to 90 degrees** (no reaching below the shoulder) forces l1 to equal about the shoulder height (70, 100, 200, 300 mm for H = 50, 100, 200, 300), because every target lies below the shoulder.

```bash
cd research/robofab-reach
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # about 1 minute; output in experiments/results.txt
```

## Motivation

Track 4 (`robofab`) asks for arms that assemble parts of their own tooling. `robofab-selfparts` showed the geometry allows it for a toy design if the jaw opens 30 mm. A natural next constraint is whether an arm small enough to be printed from the same kind of parts can physically reach everything, which sets a lower bound on the arm that a bootstrapping chain would need.

## Builds on

Task-and-motion-planning and workcell directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from either lab is reproduced, and nothing here is affiliated with or endorsed by them. It extends this repository's `research/robofab-selfparts` (same toy gripper dimensions, copied into `model.py` so the project is self-contained). The two-link inverse kinematics is the standard textbook law-of-cosines solution (for example Siciliano et al., *Robotics: Modelling, Planning and Control*, Springer 2009, ch. 2; not re-verified in this run, which had no web access).

## Method

`src/robofab_reach/model.py`. `reachable` solves two-link IK in the (r, z) plane, trying both bend directions, and checks the shoulder elevation and elbow bend against limits. `targets` builds the pick, place and lift points; trays are three columns by two rows at 50 mm pitch beyond the fixture. `best_base` grid-searches base positions within 400 mm of the fixture; `min_link` increases l1 in 10 mm steps until a base exists. Tests check the full-extension boundary, fold and shoulder limits, monotonicity in tray gap, and that the reported arm is feasible while the next shorter one is not.

## Limitations

Stylised. Wrist point only: no collision of links with parts or table, no wrist orientation (the jaws must point down), no payload, torque, speed, backlash or calibration error, and a single toy gripper whose tray layout and the 30 mm lift were chosen by hand. Results are quantised to the 10 mm link grid and 10 mm base grid, so differences of that size are not meaningful. The planar-with-turntable arm is a simplification of real low-cost arms. Simulated results are not claims about physical arms.

## Next steps

Link-versus-part collision, a downward-pointing wrist constraint, a MuJoCo arm with real joint limits, and combining reach with the assembly-order search of `robofab-selfparts`.

## Owner steps

Printing and testing on a low-cost open arm such as the SO-101 is the owner's call; no prices were verified in this run, so no bill of materials is given.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
