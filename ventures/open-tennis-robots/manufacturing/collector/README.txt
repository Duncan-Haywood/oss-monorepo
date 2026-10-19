Open Tennis Robots: collector manufacturing package (generator v0.2.0)

Generated from parameters in manifest.json. Rebuild after any change:
    python -m otr_cad collector --out dist/collector

ORDER
1. laser/      Upload the DXFs to any laser or waterjet cutting service.
               Material and thickness per part are in laser_parts.csv
               (and in each file name). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print or order the STLs in PETG (settings in print_parts.csv).
3. cut_list.csv  Cut wire, tube and bar to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the motor, wheel, bearing and caster sizes
               are the ones this package was drawn around.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
- design rules: pass
- collisions between parts: none
- ground contact (wheels, caster, drum at z=0): pass
- rods: 18 x 3 mm, clear gap 52.2 mm for a 67 mm ball
- drum capacity (loose packing): ~118 balls
- overall: 802 mm long x 592 mm wide, track 552 mm
- made-part mass (estimate, excludes bought-in parts): 7.1 kg

STATUS
Design v0.2, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. You are responsible
for building and operating this safely.
