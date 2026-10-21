# Printed mechatronics: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an LLM agent picking or scoping work on
automated manufacturing of robots and mechatronic products in this
repository. **Human version:**
[`../posts/2026-10-21-3d-print-a-robot-automated-manufacturing.md`](../posts/2026-10-21-3d-print-a-robot-automated-manufacturing.md).
**Data and code:** [`assets/printed-mechatronics/`](assets/printed-mechatronics/README.md).

## The owner's question

"What would it look like to have an automated manufacturing system that could
do the equivalent of 3D printing mechatronics and robots? ... It could be a
multipart system with automated assembly based on current consumer things ...
[to] distribute products to people for relatively low cost." (owner,
2026-10-21). Treat this as a direction for many runs, not a single task.

## Answer

Printing the structure is already solved and cheap. In the cheapest
well-documented open arm, plastic is about 6% of the parts cost and the
actuators are about 70%. A "robot printer" is therefore mostly three other
problems: getting actuators cheaply, assembling and wiring purchased modules
by robot, and testing the result. Fully printed actuators exist in the lab
but are orders of magnitude too weak to replace a hobby servo today. Build
toward a **hybrid cell**: print the structure, buy a small fixed catalogue of
commodity modules, assemble by robot, and self-test.

## Evidence (verified 2026-10-21)

`python3 docs/reports/assets/printed-mechatronics/so101_cost.py`, output in
`results.txt` next to it.

| SO-101 follower arm (SO-ARM100 @ `a758567c`) | Value |
|---|---|
| Purchased parts, README BOM (re-added, matches) | $121.94 |
| Six STS3215 serial-bus servos | $83.34 |
| Board, cable, power supply | $27.60 |
| Tooling (clamps, screwdriver) | $11.00 |
| Printed geometry: solid volume, surface area | 571.3 cm^3, 2023 cm^2 |
| Printed mass, 100% infill (upper bound) | 708 g |
| Printed mass, 0.8 to 1.6 mm skin + 15% infill (estimate) | 277 to 447 g |
| Central case without tooling (1.2 mm skin, $20/kg) | $118.18: actuators 70.5%, electronics 23.4%, plastic 6.1% |
| Worst case (solid at $30/kg, tooling in) | plastic 14.8%, actuators 58.2% |

The printed mass is a geometric estimate; no slicer was run. Even the
solid upper bound leaves actuators the largest line by a factor of four.

State of the art in printing the active parts (sources checked by web
search on 2026-10-21):

- **Multi-material jetting** prints passive mechanisms with soft and stiff
  materials in one job: a tendon-driven hand with bones, ligaments and
  tendons. Buchner et al. (2023), "Vision-controlled jetting for composite
  systems and robots", *Nature* 623, doi:10.1038/s41586-023-06684-3;
  commercialised by Inkbit. The hand still needs external actuation.
- **Printed electric motors:** Cañada, Bigelow and Velásquez-García,
  "Fully 3D-Printed Electric Motor Manufactured via Multi-Modal,
  Multi-Material Extrusion", *Virtual and Physical Prototyping* (MIT News,
  2026-02-18). A linear actuator from five materials in about three hours,
  about $0.50 of material, peak displacement 318 um at 41.6 Hz, with the
  magnets magnetised after printing. That is a demonstrator, not a joint
  actuator; the STS3215 it would replace is rated at 16.5 kg cm stall
  torque (SO-ARM100 README).
- **Electronics assembly** is already desktop scale and open:
  [LumenPnP](https://docs.opulo.io/) (Opulo) is an open-source pick-and-place
  machine that places parts down to 0402 per its docs. Price was not
  verified this run; don't quote one without a fetch.

## What the system looks like (proposed architecture)

1. **Structure:** an FDM farm (cheap, solved). Research question: print
   time and failure rate per product, not feasibility.
2. **Module catalogue:** a short list of bought, mass-produced parts every
   product draws from: serial-bus smart servos, one controller board, one
   power supply, standard fasteners. A daisy-chained servo bus collapses
   the wiring to one cable per joint, the step robots handle worst.
3. **Robot assembly:** an arm cell that seats servos into printed pockets,
   drives screws and plugs bus cables. Designs are rewritten for it: top-down
   assembly, snap fits or few screws, gauges for print tolerance.
4. **Test:** the product calibrates and tests itself with its own servos
   before packing.
5. **Later:** printed gearboxes around bought motors, then printed motors,
   each adopted only when its cost and torque beat the catalogue part.

Low cost comes from step 2's volume pricing and from steps 3 and 4 removing
labour, not from printing.

## What the repository already has

Don't redo these; extend them.

- `research/robofab-*` (49 projects): assembly-order counting, peg-in-hole
  transfer, twin-checked robot programs, printer-arm-inspection cell
  bottlenecks, tolerance stacks, a gripper building its own parts. All
  stylised geometry; none uses a real product. Roundup:
  `docs/posts/2026-10-20-robot-assembly-simulation-digital-twin-findings.md`.
- `research/selfrep-*` (40 projects): closure of a RepRap; motors and
  electronics dominate the vitamins there too
  (`docs/posts/2026-10-20-self-replicating-3d-printer-reprap-closure-research.md`).
- `research/osrobot-*`: purpose-built robots against general ones.
- `research/PROJECTS.md` track 4 ends on an owner step: test on an SO-101.

## Next milestones, best first

1. **`robofab-so101cell`:** a discrete-event twin of a cell making SO-101
   arms, with print time from a real slicer run on the STLs above (install
   PrusaSlicer or CuraEngine CLI; cite version), and assembly steps counted
   from the published assembly guide
   (<https://huggingface.co/docs/lerobot/so101>). Output: arms per day and
   labour minutes per arm, against manual assembly.
2. **`robofab-so101seq`:** run `robofab-sequence`'s order counting on the
   real SO-101 part geometry (the individual STLs are in the same repo)
   instead of boxes. Which steps can a top-down arm do?
3. **`robofab-servoinsert`:** peg-in-hole for a real STS3215 in its printed
   pocket, using the repository's gauge files to set the clearance, in
   MuJoCo as in `robofab-insert`.
4. **Printed gearbox price check:** cost and published torque of an open
   printed cycloidal or planetary actuator around a bought BLDC motor, set
   against $13.89 per STS3215. Cite every price with a date.
5. **Venture angle (not before 1 to 3):** a page that turns any open robot's
   BOM and STL into this cost split. It reuses `so101_cost.py`.

## Pitfalls

- "3D print a robot" invites demos of printed hands. The hand in the Nature
  paper is passive; check actuation before citing a printed robot as one.
- Retail BOM prices move. Cite the commit or page date, as `so101_cost.py`
  pins the commit.
- No hardware here. Physical tests are an owner step (`goals.md`).
