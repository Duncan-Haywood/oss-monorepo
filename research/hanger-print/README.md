# hanger-print: can the hanger a cloth simulation designed be 3D-printed, and does it hold a garment?

Can the hanger shapes `hanger-fit` designed in simulation be made on a desktop 3D printer, and
do they hold a garment? **Yes, with two caveats. The round-ended design (end radius 2.86 cm) is
very stiff when printed flat in PLA: under the assumed 1.5 kg garment and a 2× motion factor its
arm has a safety factor of 40–70 at 12 mm depth and bends 0.04 mm at the tip at most, against a
1.6 mm shape error in the simulation, so strength never limits it. The thin-ended designs the
simulation rejects for creasing fail here too: a printed wire-like arm (end radius 1.5 mm) has a
safety factor of 0.13 at 12 mm depth and would need 278 mm of depth to reach 3. And no hanger
of a useful width fits a 220 mm printer bed in one piece (only the 16 cm and child widths fit a
256 mm bed, turned 45°), so every rack width now ships as two halves joined by a bolted half-lap
at the hub (two M4 bolts); each half fits a 220 mm bed (the 25 cm loop half needs 219.8 mm, so
check your bed's usable area) and the joint's hand-calculated safety factor is 6.9 or more.**
Output: STL files of the whole hanger and of the two halves for the four-width rack, OpenSCAD
for the whole hanger, and a Python generator and checker for any `hanger-fit` parameters.
Produced with AI assistance (Claude). Milestone 7 of research track 18 (`hanger`, `PROJECTS.md`).
The strength numbers rest on assumed material constants, and the OpenSCAD files were not
rendered in this run (no OpenSCAD in the image); the STL files come from the same outlines and
are checked as closed meshes in the tests. Nothing has been printed or loaded yet.

**Live page:** https://marisstella.app/research/hanger-print/

## Why this question

`hanger-fit` found that a hanger whose arm width the robot sets to the garment, or a rack of four
fixed widths, holds seven shirt sizes within 1 cm of their worn shape, with a round end of about
2.9 cm radius. That is a shape in a 2D simulation. The by-product `PROJECTS.md` asks for is
the printable part people can use today, with a strength check, so that a reader with a printer
can try the designs and the owner can see which ones are worth making.

## Builds on

- `research/hanger-fit` (this repository): the four design parameters (arm length *w*, slope,
  bow, end radius *r*), the adjustable shape (slope 15.92°, bow 0.59 cm, *r* 2.86 cm) and the
  rack of four widths (16, 19, 22 and 25 cm). The centreline is the same Bézier curve.
- Euler–Bernoulli beam theory for the cantilever checks (any strength-of-materials text).
- Lab tags: none. It builds on no group listed in `prompt.md`.

## Method

- **Geometry** (`src/hanger_print/geom.py`). Millimetres, frontal plane, hook at the origin.
  Each arm is the centreline offset by *r* each side with a round cap, as a flat outline
  extruded to a `depth` (front to back; `hanger-fit`'s 2D section does not say, so it is a free
  choice, default 12 mm). The hub is a disc of radius *r*, and a post and an 8 mm-wide loop
  (hole radius 5 mm) let a robot's rail pin or hook carry it. A part is five overlapping shells,
  merged by the slicer or by OpenSCAD's `union()`.
- **Meshes** (`mesh.py`). Each shell is triangulated from its stations, extruded, and written as
  ASCII STL; the same outlines go into an OpenSCAD file as `polygon()` and `linear_extrude`.
  Tests check that every shell is a closed, consistently oriented manifold and that its volume
  equals outline area × depth to 2%.
- **Strength** (`strength.py`). The arm is a cantilever, section 2*r* by *depth*, loaded at its
  tip by half of the garment's weight times a dynamic factor. Bending stress at the root is
  multiplied by a stress concentration, and compared with an allowable in-plane stress. Printed
  flat, the stress runs along the layers.
- **Assumptions** (all in `strength.py`; none measured): PLA with modulus 3500 MPa, allowable
  40 MPa in plane, stress concentration 2, dynamic factor 2, a 1.5 kg heaviest garment (a wet
  coat is heavier; this is a choice), density 1.24 g/cm³. Mass is estimated with two 0.8 mm
  perimeters, 0.8 mm skins and 15% infill, with a minimum depth of 6 mm.
- **Two-piece version** (`split.py`, added 2026-11-18). Built with the manifold3d boolean
  kernel (the one recent OpenSCAD uses), so each half is a single closed solid. The joint zone is
  the hub disc. Half A (the loop half) is the right arm, the post and loop, and the back 4 mm of
  the hub; half B is the left arm and the front 4 mm of the hub, notched round the post with
  0.2 mm clearance so the post locates it. Two 4.4 mm holes at (±17, −10) mm take M4 bolts.
  Depth is 8 mm so each lap is 4 mm. `rack_w*_B.stl` is written turned over, lap on the bed;
  turn it back to assemble. The joint check (`split.joint_check`) passes the plain arm's tip
  load and its moment to the loop half through the two bolts as a couple and checks bolt
  bearing on the 4 mm lap, the lap's net section at the outer bolt, and B's section where the
  post notch halves it, all with the same assumed constants and stress concentration as the
  arm, and ignoring bolt-preload friction.
- **Bed fit** (`geom.bbox_fits`). The outline is turned in 5° steps to find the smallest
  bounding square; a part fits if that square is within the bed.

## Results

From `experiments/results.txt`, written by `experiments/run.py` (under a second). Constants are
assumed, so read the ratios, not the digits.

**A. The rack and the adjustable design print stiffly and light.** At 12 mm depth the safety
factor is 70 (16 cm) to 42 (25 cm) for the four rack widths and 71 to 40 for the seven
adjustable widths; the depth that would give a safety factor of 3 is 0.5–0.9 mm, so a 6 mm arm
is limited by being printable, not by load. The tip bends 0.008–0.04 mm. Sliced mass at 6 mm
depth is about 63 to 96 g, solid arms are far heavier (each 25 cm arm is 150 cm³ before
slicing). The loop's ligaments carry 0.18 MPa.

**B. The round end is what makes the arm stiff.** At 23 cm, 12 mm deep:

| end radius *r* (cm) | safety factor | depth for SF 3 (mm) | mass (g) |
|---|---|---|---|
| 0.15 (wire-like) | 0.11 | 323 | 438 |
| 0.3 | 0.45 | 80 | 135 |
| 0.5 (plastic-like) | 1.26 | 29 | 65 |
| 1.0 | 5.1 | 7.0 | 36 |
| 2.0 (wood-like) | 21.5 | 1.7 | 61 |
| 2.86 (`hanger-fit`'s D) | 45.9 | 0.8 | 87 |

![Safety factor against end radius](experiments/stiffness.svg)

Printed at the thickness of a wire hanger, the arm would snap. `hanger-fit` found that thin ends
crease cloth, and this shows they are also not printable. Mass is lowest near *r* = 1 cm, where
the arm just meets the safety factor; the extra 25–51 g of a 2–2.9 cm radius buys the crease-free
end `hanger-fit` found, which this project did not re-test.

**C. Nothing fits the bed whole.** Whole hangers fit a 256 mm bed only at 15.8 and 16 cm
(turned 45°) and a 220 mm bed at no width. One arm with its hub fits a 220 mm bed for widths up
to 24.8 cm (turned 63°, counting the post and loop that half carries), but not for the 25.8 cm XXL. Section E is the
two-piece version that this makes possible.

![The four rack widths as printed outlines](experiments/rack.svg)

**D. *w* is the length along the arm, not the reach.** `hanger-fit` defines *w* as the arm
length to the outer end and the arm slopes down at 16°, so the horizontal reach of the
adjustable hanger at *w* = 22.8 cm is 22.0 cm (the test checks the formula
(*w* − *r*) cos(slope) + *r*). A printed hanger measured across the shoulders is about 0.8 cm
narrower than *w* suggests, and `hanger-fit`'s "0.8 cm wider than the half shoulder" is in *w*.

**E. Two halves and two M4 bolts put the rack on a 220 mm bed.** From `results.txt` section D,
depth 8 mm, both halves as solid meshes:

| width | loop half A, bed side (mm) | plain half B (mm) | solid mass A + B (g) | bolt force (N) | SF bearing / lap / notch |
|---|---|---|---|---|---|
| 16 cm | 156.4 | 150.2 | 92 + 85 | 55 | 11.6 / 14.3 / 11.6 |
| 19 cm | 177.2 | 171.5 | 109 + 102 | 68 | 9.5 / 11.3 / 9.4 |
| 22 cm | 199.3 | 192.7 | 126 + 119 | 80 | 8.0 / 9.4 / 7.9 |
| 25 cm | 219.8 | 213.9 | 143 + 136 | 92 | 6.9 / 8.0 / 6.9 |
| 25.8 cm (XXL) | 225.3 | 219.5 | 147 + 141 | 96 | 6.7 / 7.7 / 6.6 |

The joint, not the arm, now sets the safety factor (6.9 against the arm's 42 at 25 cm), and it
is still above 3 at every width. The 25 cm loop half clears a 220 mm square by 0.2 mm when
turned 63°, so it needs a bed whose usable area is the full 220 mm; the XXL width still needs
a bigger bed. Masses are solid PLA before slicing; a sliced half is lighter. The tests check the
shipped STL files with the standard library alone (closed and consistently oriented, flat on the
bed, at most 8 mm tall, within 220 mm when turned, lap and bolt holes where the generator puts
them), that the two halves do not overlap and rebuild the hanger less the holes and notch
clearance, and the joint numbers against a hand calculation.

Building the halves also showed a defect in the whole-hanger files: the 14 mm post ran up to the
centre of the loop, so once the slicer merged the shells it filled the lower half of the 10 mm
pin hole. The post now stops at the bottom of the hole (masses moved by up to 7 g in tables A
and B), and a test checks it.

## What this does and does not show

- It shows the arms are not the weak point, and that a printable hanger can follow the
  simulation's shape. It does not show the garment hangs as simulated: no cloth is involved.
- The arms are 57 mm thick in the frontal plane (2*r*), as `hanger-fit`'s section needs;
  front to back they are 6–12 mm. That is a chunky, boomerang-like part. A real shoulder wants
  a shaped front-to-back profile this project does not model.
- The stress, modulus, factor and load figures are textbook-style assumptions for FDM PLA. Real
  printed parts differ by print orientation, temperature, infill and humidity.
- Tip deflection is for a straight beam at the static load and is a lower bound on the arm's
  sag; the bow and the slope matter little at these stiffnesses.
- No adjustable-width mechanism is designed: the seven adjustable widths are fixed parts, one
  per width, like the rack. The telescoping and folding mechanisms of `hanger-insert` are not
  modelled in CAD.

## Safety

A hanger loaded near its strength limit can snap and leave sharp edges: the wire-like design
would. Print the designs with a safety factor above 3 and round the edges. A real rail,
loop or pin and the robot's gripper are owner decisions; no run builds or powers hardware.

## Owner steps

1. Print `experiments/cad/rack_w22_A.stl` and `rack_w22_B.stl` flat, each turned about 63° in
   the slicer, on any bed with 200 mm of usable square (the 25 cm halves need the full 220 mm).
   PLA or PETG, 3 perimeters, 15–20% infill, no supports. Turn B over, lay its lap on A's,
   seat the notch round the post and fit two M4 × 16 bolts with washers and nuts, snug, not
   crushing the plastic. The whole-hanger `rack_w22.stl` needs a 317.5 mm square bed.
2. Hang a real shirt (size M) on it and compare it with a stock hanger by eye, then try the other
   three widths. Photographs would give the first real check of `hanger-fit`.
3. Measure the real material: print and break a few arms with weights.
4. Bill of materials: a printer with a 220 mm bed, two M4 × 16 bolts, four washers and two
   nuts per hanger, and under 250 g of filament per two-piece hanger (the solid mass; sliced it
   is less). No prices are given because none were checked.

## Limitations

Flat extrusion only, no front-to-back shaping; one hanger family; strength from a beam formula
with assumed constants and no fatigue, creep (PLA creeps under steady load) or layer-adhesion
check; the whole hanger does not fit a normal bed; the two-piece joint is a hand calculation
with the same assumed constants, not a test of printed bolted laps (layer-line bearing and
creep under bolt preload are unmeasured); no OpenSCAD source for the halves; OpenSCAD files
untested in a renderer; one load case.

## Known gaps

- Fixed 2026-11-18: the committed STL files were whole hangers that fit no 220 mm bed (quality
  audit [`2026-11-17-hanger-print.json`](../../portfolio/quality/audits/2026-11-17-hanger-print.json),
  defect 0). The two-piece files `rack_w*_A.stl` / `_B.stl` now fit; the XXL width (25.8 cm)
  still does not.
- The joint has not been printed or loaded; its safety factors rest on the same assumed PLA
  allowable as the arm.

## Reproduce

```
cd research/hanger-print
python3 -m unittest discover -s tests           # 18 tests, under a second (3 skip without manifold3d)
pip install -r requirements.txt                 # manifold3d, for the two-piece halves
PYTHONPATH=src python3 experiments/run.py       # writes results.txt and experiments/cad/*.stl|scad
python3 experiments/figure.py                   # rack.svg and stiffness.svg
```

Python 3.9+. The whole-hanger files, the checks and the tests of the shipped files need only the
standard library; generating the two halves needs `manifold3d` (Apache-2.0).

## Next steps

1. A front-to-back shoulder profile (the two-piece version exists since 2026-11-18); test the shoulder shape against the 3D
   cloth drape of milestone 4 (`hanger-3d`).
2. Print the arms and break them, to replace the assumed material constants (owner step).
3. Lighter arms: a hollow or ribbed arm that keeps `hanger-fit`'s 2–3 cm end radius.

## Outside dependencies

`manifold3d` to regenerate the two halves; otherwise Python's standard library. A 3D printer, filament, a slicer and OpenSCAD (to render
the `.scad` files) are the vitamins.
