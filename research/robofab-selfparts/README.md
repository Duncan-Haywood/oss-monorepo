# Can a parallel-jaw arm assemble its own printed gripper? Grasp and approach constraints on a seven-part toy gripper

Pure Python, no dependencies. A toy parallel-jaw gripper (base, two rails, two fingers, a centring link, a cover; axis-aligned boxes in millimetres, dimensions chosen for this study) is assembled one part at a time by a modelled arm. A step is valid if the part can leave the assembly along an allowed direction without collision, a jaw pair can grip it (it fits the jaw opening; the jaw pads neither overlap nor are swept into placed parts), and the partial assembly is statically supported. Exhaustive search over subsets counts every valid order. All numbers come from `experiments/results.txt`. This is milestone 5 (`robofab-selfparts`) of the `robofab` track, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-selfparts/

- **The cover sets the jaw requirement.** With a jaw opening of 25 mm or less, no complete order exists under any arm model: the largest reachable subassembly is 5 of 6 free parts and the cover is never placed. At 30 mm (the cover's 30 mm width in y) and above, a complete order exists. The minimum opening is 30.0 mm for all three arm models (0.5 mm steps). This is close to a restatement of the design: the arm must be able to hold the widest part of the thing it builds.
- **Approach direction matters, jaw width above 30 mm does not.** Of 720 orderings of the six free parts, 384 are valid when the arm can lift or slide parts in any direction, and the same 384 when it is only forbidden from pushing parts up from below (nothing in this design needs that). A strictly top-down arm gets 120 (5!: the cover must go last, all others in any order).
- **Gravity matters less than approach.** With the support rule off (every part held in place), the free and side arms accept all 720 orderings and the top-down arm still 120. The support rule alone removes 336 of 720 orders for the free and side arms.
- **Negative result.** Jaw-pad thickness from 2 to 10 mm changes nothing (384 orders throughout) in this geometry; the pads always find free space. This is a limitation of the toy design, not evidence that pads never matter.

```bash
cd research/robofab-selfparts
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~2 s (includes brute-force check of the counts)
PYTHONPATH=src python3 experiments/run.py                 # ~10 s; output in experiments/results.txt
```

## Motivation

Track 4 asks for arms that make and assemble things, eventually including parts of their own tooling (joining track 1, self-replication). A first necessary condition is geometric: can the arm's own end effector grip and place every part of a copy of itself? This asks that question in the simplest checkable form and leaves the harder ones (reach, force, tolerance, fasteners) for later.

## Builds on

Task-and-motion-planning and workcell directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>) and the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>). No paper from either lab is reproduced, and nothing here is affiliated with or endorsed by them. It extends this repository's `research/robofab-sequence` (same collision and support rule, rewritten here so the project is self-contained) with a grasp and approach-direction model. Context, cited and not reproduced: Tian et al. (2024), "ASAP: Automated Sequence Planning for Complex Robotic Assembly with Physical Feasibility", ICRA, <https://doi.org/10.1109/ICRA57147.2024.10611595>; Jones et al. (2011), "RepRap – the replicating rapid prototyper", *Robotica* 29(1):177–191, <https://doi.org/10.1017/S026357471000069X>, and Zykov et al. (2005), "Self-reproducing machines", *Nature* 435:163–164, <https://doi.org/10.1038/435163a>, for the self-replication framing. Citations were copied from `PROJECTS.md` (checked there 2026-10-12); this run had no web access to re-verify them.

## Method

`src/robofab_selfparts/model.py`. Arm models name the allowed removal directions: `free` (all six), `side` (up and four horizontals; never pushed up from below), `top` (strictly top-down insertion). Grasp: for the x or y axis, two pads (thickness `pad_t`, central `pad_frac` of the face) sit on opposite bounding-box faces; the part's extent along that axis must not exceed the jaw opening; pads must not overlap placed parts at the final pose, nor be swept into them along the move. Support: as in `robofab-sequence`, every non-base part must rest on a placed part below (1 mm settle gap), centre of mass above the bounding rectangle of its patches. Search: DP over subsets of placed parts; tests compare counts with brute force over all 720 orderings for four settings.

## Limitations

Stylised. One seven-part design, boxes only, single-part straight-line moves, parallel-jaw grasp on bounding-box faces only, no reachability, force, friction, press-fit, fastener or tolerance model, no re-grasp or part handover, and the fixtured base is assumed placed. Motors, screws and cables are excluded and the gripper is not a real design. The 30 mm threshold follows directly from the cover's size. Which arm models agree depends on this geometry (nothing needs insertion from below), so the free and side results being identical says little about arms in general. Simulated results are not claims about physical arms or printed parts.

## Next steps

Larger, real printed-gripper geometry (meshes), reach and joint limits from a MuJoCo arm, a grasp-stability check, re-grasp cost in the objective, a copy built by the arm using its own printed fingers as jaws (a bootstrapping chain), and the owner step below.

## Owner steps

Printing the parts and testing on a low-cost open arm such as the SO-101 is the owner's call; no prices were verified in this run, so no bill of materials is given.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
