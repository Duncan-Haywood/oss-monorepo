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
  **Not yet modelled:** the netting and trough, hopper and agitator, feed
  tube, elevation actuator bracket, azimuth drive and cabling. The BOM lists
  the actuator and drive as bought parts without a mount.
