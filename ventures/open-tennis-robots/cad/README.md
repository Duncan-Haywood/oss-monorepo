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
  **Known gaps, found by this model:** the hose end swings about 450 mm as the
  head tilts (`mouth_world`), which the 600 mm cut length only just absorbs; the
  1.4 m posts need bracing before the tub is filled.
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
  **Not yet modelled:** the netting and trough, hopper agitator, brackets for
  the shuttle and elevation actuators, azimuth drive and cabling. The BOM
  lists the actuators and drive as bought parts without a mount.
