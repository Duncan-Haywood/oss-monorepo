# Parametric CAD and manufacturing packages

Code-CAD for the Open Robot Mower and its dock, built on
[build123d](https://github.com/gumyr/build123d) (OpenCascade). The package
layout, the file normalisation that makes builds byte-reproducible and the
deterministic zip follow Open Tennis Robots' generator
(`ventures/open-tennis-robots/cad/`). One command turns the parameters into
everything a fabricator needs:

```
pip install -r requirements.txt        # build123d, pinned
python -m orm_cad mower --out ../manufacturing/mower
python -m orm_cad dock --out ../manufacturing/dock
```

| Output | For |
| --- | --- |
| `laser/*.dxf` | Laser or waterjet cutting service. Flat aluminium 5052, true mm, no bends, no tapped holes |
| `print/*.stl` | Any FDM printer or print service, ASA; every part fits a 256 mm bed |
| `step/*.step`, `step/assembly.step` | Any CAD package (Fusion, FreeCAD, Onshape, SolidWorks), CNC/CAM |
| `cut_list.csv` | Threaded rod and tube cut to length |
| `bom.csv` | Every part: made, cut, bought, and the fasteners |
| `drawings/*.svg` | Top, side and front views of the assembly |
| `manifest.json` | Parameters, derived numbers (mass and centre-of-mass estimate), check results, SHA-256 of every file |
| `mower-package.zip` | All of the above, ready to send |

## What the build checks

The generator exits non-zero if any of these fail:

- **Design rules** (`params.Mower.check`): blade tips at least 12 mm from the
  guard; guard at least 5 mm below the blade plane at the lowest cut and at
  least 10 mm off the ground; blade-tip circle at least 100 mm inside the
  shell edge; height plate clear of the chassis at the highest cut; rods
  outside the blade circle and inside the guard; drive motors and hubs fit;
  the caster fork clears its wheel; the swivelling caster's swept circle
  clears the guard; shell clearances to the wheels; shell segments fit the
  printer bed; tray clear of the battery and the blade motor.
- **Collisions**: every pair of parts, bought-in parts as envelopes,
  intersects with zero volume. Parts that spin (blades, disc, hub, motor
  can) are modelled as their swept envelope grown by 2 mm, so "no
  collision" means nothing touches anything that spins.
- **Every cut height**: the height plate and the spinning parts are moved
  through all seven settings (20-50 mm) and checked again.
- **Shell travel**: the shell, with the stop button and rain sensor on it,
  is pushed 8 mm forward, back, left, right and up; it must touch nothing.
- **Ground contact**: rear wheels and casters at z = 0, and the lowest
  other part (the guard) is reported as the ground clearance.
- **Printer bed**: every STL's bounding box fits the bed less a margin.
- **Dock fit**: the default mower is placed on the dock with its contacts
  touching the strips; nothing else may touch, and the strips must overlap
  the mower's contact pockets by at least 6 mm.

`tests/test_cad.py` adds hole alignment (every pilot hole in a printed
part that bolts to a laser-cut plate lands on a hole in that plate), checks
that the four guard quarters close the ring, that the checks themselves
can fail, that the DXFs read back in millimetres, that two builds are
byte-identical, and that the committed packages match a fresh build.

## Changing the design

Edit `orm_cad/params.py`, or override from the command line:

```
python -m orm_cad mower --out /tmp/wide --set shell_half_w=260 --set cut_max=45
```

If you change the track, cut width or wheelbase, change the matching
defaults in `src/mowerbot/` too: a test fails until they agree.

Bought-in parts (gearmotors, wheels, blade motor, blades, rubber mounts,
battery, boards) are drawn from the dimensions in `params.py`. Check them
against the datasheet of the part you actually buy before cutting metal.

## Status

Design v0.1, not yet built. Not yet modelled: wiring and connectors, a
sealed electronics enclosure, the hall-sensor helper board, the dock's
charge-enable circuit, and tyre tread.
