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
- hose: 1070 mm; chord 810 to 1014 mm and falls at least 70 deg over the elevation range; bows to a 426 mm radius at its closest pose (hose allows 150)
- hose with end directions: fits -15 deg 839-912 mm; +0 deg 812-831 mm; +15 deg 843-864 mm; +30 deg 921-1031 mm; +45 deg 1037-1222 mm; no one cut length fits every pose: needs 206 mm of take-up (103 mm of travel on a floating pulley, which cannot carry balls: its 180 deg wrap climbs, a ball-carrying hose may wrap 60 deg at most; limiting nose-up to +30 deg would need 89 mm; see take_up_line for the sleeve that replaces it)
- take-up: sleeve 96 mm bore, 300 mm long, under the outlet; the hose's collar slides 236 mm in it, so the free hose runs 521 to 757 mm from 1705 mm up; slide allowed per pose (elevation/azimuth, -azimuth mirrors) -15/0 deg 46-62; -15/15 deg 46-62; -15/30 deg 45-61; +0/0 deg 0-0; +0/15 deg 0-4; +0/30 deg 0-15; +15/0 deg 3-10; +15/15 deg 8-21; +15/30 deg 24-45; +30/0 deg 81-137; +30/15 deg 88-147; +30/30 deg 108-174; +45/0 deg 205-327; +45/15 deg 211-335; +45/30 deg 236-349 mm; hose cut 810 mm; spring 5 N (assumed); balls fall straight down the sleeve, then at least 30 deg
- hopper frame: full tub 116 N; sway load 60 N; braces carry 185 N (x) and 226 N (y) against buckling loads of 1619 and 1443 N; a post alone buckles at 1824 N (pinned ends, 2040 weak axis; section figures are assumptions)
- net: 3000 wide x 2470 mm tall between the poles
- wind: 69 N on the net at 8 m/s (solidity 0.2, Cd 1.2); ballast needed over the made-part mass (hopper posts, shelf and spigot not credited): 15 kg
- made-part mass (estimate, excludes bought-in parts): 38.9 kg

STATUS
Design v0.1, not yet built, and the launcher head throws balls at 30+ m/s:
read hardware/safety.md before you power anything. No warranty: see LICENSE.
Report what you find: https://github.com/duncan-haywood/oss-monorepo/issues
