# Can a printed gripper assemble its own next generation? Jaw pads, scale and a bootstrapping chain

Pure Python, no dependencies. Follow-up to this repository's `research/robofab-selfparts`, which showed that a modelled parallel-jaw arm needs a jaw opening at least as wide as the widest part of the gripper it builds (30 mm for the 40 x 30 mm toy design). Here the arm that builds the next gripper *is* the previous printed gripper, so its jaw opening is set by its own design. All numbers come from `experiments/results.txt`. Track 4 (`robofab`), simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-bootstrap/

- **A copy at the same size cannot be built (stylised).** The unit toy gripper offers `32 s - 2 t` mm of jaw opening at scale `s` with fixed-size pads of thickness `t` (an assumption of this study, not a measurement), but needs `30 s` mm to assemble a copy (the exhaustive search of the geometry gives exactly 30.0 s at every scale tried, 1.0 to 7.0). With `t = 4` mm the unit gripper offers 24 mm and needs 30 mm.
- **Self-assembly starts at scale `s = t`.** The smallest scale on a 0.25 grid at which a gripper can assemble a copy equals the pad thickness in mm (1, 2, 3, 4, 6 for `t` = 1, 2, 3, 4, 6). This is the closed form `32 s - 2 t >= 30 s`, so the search confirms algebra rather than finding something new.
- **An actuator stroke cap bounds the window.** With `t = 4` mm, a jaw stroke of 100 mm or less admits no self-assembling scale; 120 mm admits only 4.0; 160 mm admits 4.0, 4.5 and 5.0. The condition is `30 t <= stroke`.
- **Chains from a purchased seed.** Seeds with 24 mm opening cannot build any gripper in the scale set. Seeds of 60 and 100 mm build progressively smaller grippers and the chain dies out after 3 and 5 generations when always building the largest buildable design (it stops at scale 1.0). Seeds of 130 and 140 mm reach a fixed point (scale 4.0 and 4.5) that reproduces indefinitely. Building the smallest buildable design always dies after one generation.

```bash
cd research/robofab-bootstrap
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~2 s; output in experiments/results.txt
```

## Motivation

Track 1 (self-replicating manufacturing) and track 4 ask whether arms can make the tooling that makes arms. `robofab-selfparts` left a "bootstrapping chain" open: a copy built using its own printed fingers as jaws. This closes the loop in the simplest checkable form and asks how big the gripper must be, relative to its non-scalable parts (pads, motors, screws), before it can build itself.

## Builds on

Task-and-motion-planning and workcell directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from either lab is reproduced and nothing here is affiliated with or endorsed by them. Extends this repository's `research/robofab-selfparts` (geometry core copied into `src/robofab_bootstrap/model.py`, extended with a scale parameter and the chain functions). Context, cited and not reproduced: Jones et al. (2011), "RepRap – the replicating rapid prototyper", *Robotica* 29(1):177–191, <https://doi.org/10.1017/S026357471000069X>; Zykov et al. (2005), "Self-reproducing machines", *Nature* 435:163–164, <https://doi.org/10.1038/435163a>; Tian et al. (2024), "ASAP: Automated Sequence Planning for Complex Robotic Assembly with Physical Feasibility", ICRA, <https://doi.org/10.1109/ICRA57147.2024.10611595>. Citations were copied from `PROJECTS.md` (checked there 2026-10-12); this run had no web access to re-verify them.

## Method

Scaled design: every dimension of the toy gripper multiplied by `s`; pads keep thickness `t` (they model fixed-size hardware). `min_jaw(s)` is the smallest jaw opening (0.25 mm grid, bisection, valid because a wider jaw never removes a valid order) at which exhaustive search over subsets finds a complete order for a "side" arm (never pushing up from below). `opening(s) = 32 s - 2 t` is the jaw opening of a printed gripper, capped by an optional actuator stroke: the 32 mm is the toy design's rail gap and the `2 t` pad loss is an assumption. A chain starts from a seed opening, builds a scale chosen by a policy among scales whose `min_jaw` fits, and the new gripper's opening becomes the next jaw.

## Limitations

Stylised. The headline relation is closed-form given the assumed `opening(s)`; the search only confirms that `min_jaw` is `30 s`. Pads are the only non-scaling element: motors, screws, cables, tolerance and shrinkage, reach, force, friction and part count are absent, as is the 3D-printing time and material of the chain. Scales up to 7 give 210 mm parts, bigger than most desktop printers, which is not modelled. One design. Simulated results are not claims about physical grippers or printed parts.

## Next steps

Replace the assumed opening with a mechanism model (linkage stroke from finger geometry), add print shrinkage and tolerance per generation, include re-grasp or handover to drop the widest-part requirement, and use real printed-gripper meshes.

## Owner steps

Printing and testing on an open arm such as the SO-101 is the owner's call; no prices were verified in this run, so no bill of materials is given.

## Outside dependencies

None (standard library only). The pads, motors, screws and cables of a real gripper are vitamins the model does not make. Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
