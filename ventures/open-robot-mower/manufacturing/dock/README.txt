Open Robot Mower: dock manufacturing package (generator v0.1.0)

Generated from parameters in manifest.json. Rebuild after any change:
    python -m orm_cad dock --out dist/dock

ORDER
1. laser/      Upload the DXFs to any laser or waterjet cutting service.
               Material and thickness per part are in laser_parts.csv
               (and in each file name). Units are millimetres.
               No bends or tapped holes. All holes are clearance holes.
2. print/      Print or order the STLs in ASA (settings in print_parts.csv).
               Every part fits a 256 x 256 x 256 mm bed.
3. cut_list.csv  Cut rod and tube to length.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py
               before cutting: the parts were drawn around those sizes.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
- design rules: pass
- collisions between parts: none
- base plate on the ground: pass
- default mower docked (contacts touching): no part of it hits the dock: pass
- contact strips 50 mm apart, overlapping the mower's contact pockets by 12 mm
- made-part mass (estimate): 2.8 kg

STATUS
Design v0.1, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. A mower blade can cause
serious injury: never power the blade motor with the guard off, and
bench-test with the blade disc removed.
