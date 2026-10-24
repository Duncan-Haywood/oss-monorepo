Open Robot Mower: mower manufacturing package (generator v0.1.0)

Generated from parameters in manifest.json. Rebuild after any change:
    python -m orm_cad mower --out dist/mower

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
- collisions between parts (rotating parts with 2 mm running clearance), at every cut height 20-50 mm, and with the shell pushed 8 mm each way: none
- ground contact (rear wheels, casters at z=0): pass
- every printed part fits a 256 mm bed: pass
- cut width 232 mm; cut height 20-50 mm in 5 mm steps
- blade tips to guard wall: 29 mm; guard bottom 15 mm off the ground, 5 mm below the blade at the lowest cut
- shell edge to blade-tip circle: 129 mm (design rule: at least 100)
- lowest fixed part above the ground (guard): 15 mm
- overall: 640 x 490 mm, 325 mm to the antenna top; track 384 mm, wheelbase 405 mm
- mass estimate (made parts by volume, bought-in parts typical): 8.5 kg; centre of mass x=133 y=1 z=123 mm

STATUS
Design v0.1, not yet built. A first build will find things. Please
report them: https://github.com/duncan-haywood/oss-monorepo/issues
No warranty: see LICENSE and hardware/safety.md. A mower blade can cause
serious injury: never power the blade motor with the guard off, and
bench-test with the blade disc removed.
