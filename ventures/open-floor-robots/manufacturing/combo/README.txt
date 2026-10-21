Open Floor Robots: robot vacuum-mop combo manufacturing package (generator v0.1.0)

Generated from parameters in manifest.json. Rebuild after any change:
    python -m ofr_cad combo --out dist/combo

ORDER
1. laser/      Upload the DXFs to any laser cutting service. The base is
               aluminium 5052, the deck cast acrylic (laser_parts.csv has
               material and thickness per part). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print the STLs in PETG (settings in print_parts.csv).
               Every part fits a 220 x 220 mm bed.
3. cut_list.csv  Cut rod to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the motor, wheel, caster, fan, pump and
               lidar are the sizes this package was drawn around.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
- design rules: pass
- collisions between parts: none
- ground contact (ball_caster, mop_pad, wheel at z=0): pass
- centre of mass (tank full, pad up): x = -1 mm, y = 2 mm
- overall: 330 mm across, 136 mm tall with lidar (98 mm without), track 230 mm
- cliff sensors lead the wheels by 52 mm
- bin: 128 ml inside; side brush reaches 196 mm from the centre
- tank: 135 ml inside; pad 47 x 150 mm, lift 4.5 mm
- estimated mass: 2.59 kg (made parts from volume, bought-in parts typical)

STATUS
Design v0.1, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. Lithium packs can
burn: use a pack with a BMS, the fuse, and a certified charger.
