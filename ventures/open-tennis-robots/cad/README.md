# Parametric CAD and manufacturing packages

Code-CAD for Open Tennis Robots, built on [build123d](https://github.com/gumyr/build123d)
(OpenCascade). One command turns the parameters into everything a fabricator
needs:

```
pip install -r requirements.txt        # build123d, pinned
python -m otr_cad collector --out ../manufacturing/collector
python -m otr_cad feeder --out ../manufacturing/feeder
```

| Output | For |
| --- | --- |
| `laser/*.dxf` | Laser or waterjet cutting service. Flat aluminium 5052, true mm, no bends, no tapped holes |
| `print/*.stl` | Any FDM printer or print service, PETG |
| `step/*.step`, `step/assembly.step` | Any CAD package (Fusion, FreeCAD, Onshape, SolidWorks), CNC/CAM |
| `cut_list.csv` | Wire, tube and bar cut to length |
| `bom.csv` | Every part: made, cut, bought, and the fasteners |
| `drawings/*.svg` | Top, side and front views of the assembly |
| `manifest.json` | Parameters, derived numbers, check results, SHA-256 of every file |
| `collector-package.zip` | All of the above, ready to send |

The ready-built package is committed at
[`../manufacturing/`](../manufacturing/) and served from the project page.
You only need to run the generator if you change a parameter.

## What the build checks

Every build runs these checks, and the generator exits non-zero if one fails:

- **Design rules** (`params.Collector.check`): the rod gap squeezes a ball by
  15-30%, there is edge distance around holes, the drum clears the base, the
  motors fit, and the electronics tray fits.
- **Collisions**: every pair of parts, bought-in parts included as
  envelopes, intersects with zero volume.
- **Ground contact**: wheels, caster and drum all touch z = 0.

`tests/test_cad.py` adds hole alignment: every pilot hole in a printed part
that sits on the base plate must land on a hole in the plate. It also checks
that the DXFs read back in millimetres, that two builds are byte-identical,
and that the committed package matches a fresh build.

## Changing the design

Edit `otr_cad/params.py`, or override from the command line:

```
python -m otr_cad collector --out /tmp/wide --set drum_len=550 --set base_half_w=300
```

Bought-in parts (motor, wheel, bearing, caster, Raspberry Pi) are drawn
from the dimensions in `params.py`. Check them against the datasheet of
the part you actually buy before cutting metal.

## Status

- **Collector: v0.2 package complete.** It has not been built yet, so
  expect a revision after the first build.
- **Feeder: v0.1 package.** Launcher head (two plates, standoffs, wheel and
  motor envelopes), trunnion cheeks with printed feet, mast plate and
  turntable plate over a lazy-susan bearing, a 2040 base with drive and
  idler brackets, the 3 m net beam, poles, printed foot and elbow sockets,
  and a 2020 camera bar. Checks beyond the collector's:
  the head is tilted through -15 to +45 degrees and tested for collisions at
  each step (`package.elevation_sweep`), the head plates must clear the
  67 mm ball path, cheek-foot pilots must land on turntable-plate holes, and
  the wind force on the net sets a ballast figure in the manifest
  (`Feeder.ballast_kg`: moment balance about the wheel line; solidity and drag
  coefficient are assumptions to replace with a measurement).
  **Feed (added 2026-10-21):** a printed floor and roof between the head
  plates, a column that carries balls down from a hose socket, and a printed
  shuttle with a ball-sized pocket that slides forward 95 mm to the wheels
  while its solid rear shuts the column, so one ball leaves per stroke. A
  storage tub sits on a laser shelf that falls 12 degrees toward the outlet,
  on four posts bolted to the deck, and a hose joins the outlet spigot to the
  column. Extra checks: the shuttle is taller than one ball and shorter than
  two; the column clears the top wheel; the stroke reaches the wheels' contact
  point; the tub holds the wanted balls (`Feeder.tub_capacity`); the hose
  chord falls at least 30 degrees at every elevation and its circular-arc
  bend radius, taken at the closest pose, is not under the hose's limit
  (`Feeder.hose_chords`, `hose_bow_radius`: an approximation that ignores the
  hose's end directions); the shuttle fully advanced clears the head.
  **Front retainer (added 2026-10-22):** the shuttle's open front is narrowed to
  87% of the ball (58 mm) between two 1.6 mm PETG flexure arms, each with a
  5 mm relief behind it. Checks (`Feeder.retain_*`, end-loaded cantilever
  worst case): arm strain 1.0% against a 2% limit, about 17 N to drag a ball
  through against 0.14 N of ball weight at -15 deg, and 1.5x that must stay
  under the wheels' assumed 60 N pull. The modulus (1.5 GPa) and the wheel pull
  are assumptions: print one and pull a ball through with a scale.
  **Known gap, found by this model:** the hose end swings about 450 mm as the
  head tilts (`mouth_world`), which the 600 mm cut length only just absorbs.
  **Hose with end directions (added 2026-11-03, `Feeder.hose_pose_ranges`, `hose_take_up_mm`):** the chord check
  above ignores that the hose leaves the spigot straight down and enters the socket along the tilted column. Modelled
  as a cubic Bezier (handles 25-900 mm) held to the 150 mm bend limit and the 30 deg fall, the result is worse than the
  chord check said: at the shipped outlet height (1560 mm) there is no valid curve at -15 or +45 deg at all; raised to 1700 mm
  every pose fits (518-541 mm at -15 deg, 745-853 mm at +45 deg), but no single cut length fits all, so about 258 mm
  of take-up (spring reel, telescoping section or a pulley) is needed. Slack cannot simply loop because the 30 deg
  fall rules out flat sections. The model is a 2-D smooth-curve proxy for a real hose: hang a hose and check.
  **Outlet raised (2026-11-04):** `hopper_out_z` now defaults to 1700 mm; the build has no collisions, braces still pass (x 149 N vs 2472 N, y 186 N vs 2120 N). Take-up still 258 mm (`take_up_stroke_mm`: 129 mm of travel on one floating pulley). `hose_take_up_by_elev_max` gives take-up by top tilt: 31 mm at +15, 86 at +25, 119 at +30, 162 at +35, 209 at +40, 258 at +45 deg.
  **Take-up sized (2026-11-04, `Feeder.take_up_design`):** one floating pulley, 300 mm across (twice the 150 mm bend radius), on a 489 mm track with a 129 mm stroke; the hose is 487 mm fixed plus twice the pulley's travel, and the spring pulls 10 N (twice an assumed 5 N hose tension). Per-pose travel windows: -15 deg 15-27 mm, 0 deg exactly 0, +15 deg 15-23, +30 deg 62-97, +45 deg 129-183. Finding: the 0 deg pose sets the fixed length (it has the shortest longest-fit), so the pulley must go out, back to zero and out again as the head tilts, not move one way; the spring has to hold tension through that reversal. Still a 2-D proxy: the 5 N tension, 30 mm end margins and hose stiffness are assumptions. Not yet modelled as CAD parts (bracket, track, pulley).
  **Take-up parts (2026-11-05, `take_up_parts`):** the sized take-up is now CAD: a 489 mm 2040 track outboard of the -y hopper brace, a printed carriage, a printed pulley (groove at the 150 mm bend radius, flanges 6 mm over the hose; too big for a print bed, so four quadrants) and a constant-force spring envelope (10 N, assumed), all clear of the braces and swept head (no collisions; test in `tests/test_cad.py`). Not modelled: the track's tie to the hopper frame, axle and bearings, hose clips, spring anchor. Geometry check only, nothing built.
  **Hopper bracing (added 2026-11-03, `Feeder.check_hopper_frame`):** the four
  1.4 m posts were free-standing on M5 joints, which carry no useful moment. Two 2020 diagonals
  (`hopper_brace_x`, one each side, rear foot to front head) and one (`hopper_brace_y`, behind the
  rear pair; the head's swing rules out the front) now brace them. A y brace in front would hit the
  head at +45 deg: the collision sweep caught it. Checked: a full tub weighs about 116 N, the sway load is
  max(0.25 of that, 60 N), and each brace's Euler buckling load must be 3x its working force
  (x: about 134 N against 3090 N; y: about 168 N against 2585 N). One post alone buckles at about 3190 N,
  far above its share. The shelf is taken as rigid in plan. The 2020 and 2040 section figures,
  the sway load and pinned ends are assumptions: load a built frame and measure its sway.
  **Launch checks (added 2026-10-29, `Feeder.check_launch`):** the wheel gap and
  nip are tied to the flight model's launcher. For an assumed 25 m/s with 3000 rpm
  topspin the wheels must turn 6425 and 1065 rpm (the same figures as
  `tennisbots.launcher.WheelLauncher.wheel_rpm`, tested), close to the 7000 rpm
  limit, so the top wheel's motor is the part to size first. The ball is in the
  nip for 74 mm, so taking it from rest to 25 m/s needs a mean push of 241 N,
  against 416 N of friction at the 13 mm squeeze (assumed 20 N/mm stiffness and
  mu 0.8: measure both). That is far above the 60 N `wheel_pull_n` the retainer
  check assumes; the 17 N retainer drag stays safe either way. The head plates
  must also extend past the ball's exit from the nip.
  **Launch window (2026-11-08, `Feeder.launch_window`):** the checks above hold at one speed; this finds the speeds that pass. At the shipped 3000 rpm topspin the window is 17.9 to 26.8 m/s: below it the bottom wheel would have to run backwards to make that spin, above it the nip's traction (assumed 20 N/mm, mu 0.8) runs out. More topspin squeezes it from the wheel-rpm side: 3500 rpm gives 20.9 to 25.9 m/s (the top wheel's 7000 rpm limit binds), and 4000 rpm has no passing speed. A softer ball squeeze (15 N/mm) shrinks it to 17.9 to 23.2 m/s; at 5 N/mm none. So the top wheel's motor and the squeeze stiffness decide the fastest heavy-topspin drive: measure both before choosing motors.
  **Plate clearance (2026-11-09, `Feeder.plate_clearance`):** after release the ball has 6.5 mm either side (plate_half_y 40, ball radius 33.5) for a 106.5 mm run to clear the plate front. That is a yaw tolerance of 3.5 deg between wheel pair and plates, independent of speed; at 17.9 to 26.8 m/s the ball is in the head 6.0 to 4.0 ms, so a sideways push of about 1.1 to 1.6 m/s would just touch. Topspin and gravity act in the plates' own plane (they span z -225 to 190 mm), so only yaw can hit them: square the wheel axles to the plates within 3 deg when assembling. Calculated, not built; no plate-contact test.
  **Not yet modelled:** the netting and trough, hopper agitator, brackets for
  the shuttle and elevation actuators, azimuth drive and cabling. The BOM
  lists the actuators and drive as bought parts without a mount.
