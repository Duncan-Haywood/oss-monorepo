Open Tennis Robots: feeder + catch net manufacturing package (generator v0.2.0)

Generated from parameters in manifest.json. Rebuild after any change:
    python -m otr_cad feeder --out dist/feeder

ORDER
1. laser/      Upload the DXFs to a laser or waterjet cutting service.
               Material and thickness per part are in laser_parts.csv.
               Units are millimetres. No bends or tapped holes.
2. print/      Print the STLs in PETG (settings in print_parts.csv).
3. cut_list.csv  Cut the 2040 / 2020 extrusion and the poles to length;
               tap M5 into the extrusion ends where noted.
4. bom.csv     Buy the rest. Check bought-in dimensions against params.py.

NOT IN THIS PACKAGE YET: netting and trough, hopper agitator, shuttle actuator
bracket, elevation actuator and bracket, azimuth drive, post bracing, cabling. See hardware/feeder-catcher.md.

CHECKS RUN WHEN THIS PACKAGE WAS BUILT
- design rules: pass
- collisions between parts, and with the head at -15 to +45 deg elevation: none
- ground contact (wheels and levelling feet at z=0): pass
- launcher: wheel gap 54 mm squeezes a 67 mm ball by 13 mm; ball path 1000 mm high; muzzle +0 mm from the net plane
- feed: shuttle meters one ball (72 mm tall, 95 mm stroke to the wheels at -37 mm); tub holds about 125 balls
- retainer: front narrowed to 58.3 mm by two 1.6 mm arms; strain 1.0%, 17 N to pull a ball through against 0.14 N of ball weight at -15 deg (wheels assumed to pull 60 N)
- hose: 600 mm; chord 342 to 570 mm and falls at least 56 deg over the elevation range; bows to a 171 mm radius at its closest pose (hose allows 150)
- net: 3000 wide x 2470 mm tall between the poles
- wind: 69 N on the net at 8 m/s (solidity 0.2, Cd 1.2); ballast needed over the made-part mass (hopper posts, shelf and spigot not credited): 15 kg
- made-part mass (estimate, excludes bought-in parts): 34.4 kg

STATUS
Design v0.1, not yet built, and the launcher head throws balls at 30+ m/s:
read hardware/safety.md before you power anything. No warranty: see LICENSE.
Report what you find: https://github.com/duncan-haywood/oss-monorepo/issues
