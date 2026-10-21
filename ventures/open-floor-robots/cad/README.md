# Parametric CAD and manufacturing packages

Code-CAD for Open Floor Robots, built on [build123d](https://github.com/gumyr/build123d)
(OpenCascade). One command per robot turns the parameters into everything
a fabricator needs:

```
pip install -r requirements.txt        # build123d, pinned
python -m ofr_cad vacuum --out ../manufacturing/vacuum
python -m ofr_cad mop --out ../manufacturing/mop
python -m ofr_cad combo --out ../manufacturing/combo
```

| Output | For |
| --- | --- |
| `laser/*.dxf` | Laser cutting service: base in 3 mm aluminium 5052, deck in 3 mm cast acrylic, true mm, no bends, no tapped holes |
| `print/*.stl` | Any FDM printer, PETG; every part fits a 220 x 220 mm bed |
| `step/*.step`, `step/assembly.step` | Any CAD package (FreeCAD, Fusion, Onshape, SolidWorks), CNC/CAM |
| `cut_list.csv` | Rod cut to length (mop builds) |
| `bom.csv` | Every part: made, cut, bought, and the fasteners |
| `drawings/*.svg` | Top, side and front views of the assembly |
| `manifest.json` | Parameters, derived numbers, check results, SHA-256 of every file |
| `<variant>-package.zip` | All of the above, ready to send |

The packages are committed under [`../manufacturing/`](../manufacturing/).
You only need to run the generator if you change a parameter.

## What the build checks

The generator exits non-zero if any of these fail:

- **Design rules** (`params.Robot.check`): the gearmotors clear the base
  and each other, the wheel slots and cliff windows keep edge distance, the
  caster spacer is printable, bumper travel cannot reach the base edge,
  the side brush never sweeps under a cliff window, the nozzle housing
  clears the wheel pods and the pad clears the nozzle, the fan fits on the
  bin and the tank fits under the deck, the pad lift cannot hit the base,
  and the outer front cliff sensors lead the wheels by more than the
  stopping distance at the firmware's 0.35 m/s cap.
- **Balance** (`package.balance`): centre of mass from part volumes and
  typical bought-in masses, tank full and pad lifted, must sit between the
  casters (ahead of the axle for the vacuum, which has no rear caster).
- **Collisions**: every pair of parts, bought-in parts included as
  envelopes, intersects with zero volume; again with the mop pad lifted
  (`lift_sweep`) and with each bumper half pressed in by its full travel,
  head-on and from 45 degrees (`bumper_sweep`).
- **Ground contact**: wheels, casters and (mop builds) the pad all touch
  z = 0.

`tests/test_cad.py` adds: every insert pilot in a printed part that meets
the base (or the deck) lands on a clearance hole in it; nothing but the
side brush pokes outside the 330 mm footprint; printed parts fit the bed;
DXFs read back in millimetres; two builds are byte-identical; and the
committed packages match a fresh build.

## Changing the design

Edit `ofr_cad/params.py`, or override from the command line:

```
python -m ofr_cad combo --out /tmp/combo-big-wheels --set wheel_d=80 --set base_z=22
```

Bought-in parts (gearmotor, wheel, caster, battery, fan, pump, servo,
lidar) are drawn from the dimensions in `params.py`. Check them against
the datasheet of the part you actually buy before cutting metal.

## Status

Design v0.1 for all three builds; none has been built. Not yet modelled:
the dock, wire routing, the charging contacts, sprung wheel suspension
and the belt guard for the roller drive. The STEP/DXF normalisation, the
deterministic zip and the drawing views are reused from the Open Tennis
Robots generator (`ventures/open-tennis-robots/cad`).
