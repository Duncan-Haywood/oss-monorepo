# Room-by-room HVAC load calculator

**Live:** https://marisstella.app/hvac-load-calc/ · [How it works](https://marisstella.app/hvac-load-calc/how-it-works.html) · [Duct sizing](https://marisstella.app/hvac-load-calc/ducts.html)

How big should the heat pump or air conditioner be? This tool works out a
house's heating and cooling load room by room, from the walls and which way
they face, the windows, the attic, the slab or crawl space and how leaky the
house is. It reports each room's heating and cooling Btu/h, the hour each room
peaks, its airflow, and the whole-house heating load, cooling tons and design
airflow. Everything runs in the browser.

Who it is for: homeowners comparing quotes (many are still sized at about one
ton per 500 ft²), small builders, and installers without load software who
want a quick check before paying for a full report.

## Method

An open first-principles method, every step in `load.mjs` and on
`how-it-works.html`:

- U-values by the parallel-path method (cavity and stud paths).
- Heating: steady state at the winter design temperature; slab edge by
  F-factor × perimeter; air leakage from ACH50 / N; ventilation with heat
  recovery; duct loss as a percentage; altitude-corrected air properties.
- Cooling: a 24-hour clear 21 July. ASHRAE daily-range temperature profile;
  sun position from latitude and hour; ASHRAE 1985 clear-sky irradiance; window
  gain through SHGC with an incidence-angle modifier; walls through sol-air
  temperature with a lag and decrement; ceilings through an attic that warms
  with sun on the roof; people, appliances; latent load from the design dew
  point.
- The house peak is the peak of the hourly sum of rooms (rooms peak at
  different hours); room airflow is shared by each room's own peak.

It is **not ACCA Manual J** and uses none of ACCA's tables. Simplifications
(no side fins, trees or neighbours' shade, instant window gain) are
listed on the how-it-works page.

## Use

- Browser: open `index.html` (any static server), edit rooms, Calculate.
  Import and export the house as JSON; download the room table as CSV.
- CLI: `node cli.mjs house.json` (the same JSON the page exports) or
  `node cli.mjs --example --json`.
- Tests: `node --test load.test.mjs page.test.mjs duct.test.mjs overhang.test.mjs basement.test.mjs` (hand-calculated U-values,
  solar geometry, psychrometrics, room heating sums, diversity, validation).

## Overhangs (added 2026-11-18)

Each outside wall can carry an overhang: its depth, the gap from the window
head up to its underside, and the window height. For every hour of the design
day the engine finds how far the shadow edge drops below the overhang,
depth × tan(altitude) / cos(sun azimuth − wall azimuth) (the profile angle),
and cuts the window's beam sun by the shaded share of its height. Diffuse and
ground-reflected sun are left in full (the overhang does hide some sky, so this
slightly overstates the load). The overhang is taken to run well past both
sides of the window; no end effects. Heating is unchanged. Hand-worked cases
are in `overhang.test.mjs`.

What it does on the example ranch (`node eval/overhang-example.mjs`, output in
`eval/overhang-example.txt`): a 2 ft eave 1 ft above every 5 ft window cuts
the sun through windows at the house's 3 pm peak from 3,946 to 3,346 Btu/h
and the sensible peak from 19,732 to 19,072 (3.3%; 2.19 to 2.14 tons). The
south rooms fall more: kitchen/dining 4,276 to 3,959 (7%), bedroom 3 1,615 to
1,398 (13%), and their peak hour moves from noon to 1 pm. The west-facing
rooms barely move, because the afternoon sun is low enough to pass under a
2 ft eave. A 3 ft eave takes the house to 18,690 (5.3%).

## Basements and skylights (added 2026-11-19)

**Basements.** A room's floor can be `basement`, with
`basement: { depthFt, wallLengthFt, widthFt }` (depth of the floor below
grade, length of wall below grade, shortest width). Walls above grade stay in
the room's `walls` with their above-grade `heightFt`. Below-grade wall and
floor U-factors come from the path-length method of Latta and Boileau (1969)
in the closed form ASHRAE Fundamentals gives (`belowGradeWallU`,
`basementFloorU` in `load.mjs`), with soil conductivity `envelope.soilK`
(default 0.8 Btu/h·ft·°F), 8 in. concrete walls and a 4 in. slab plus
`basementWallR` / `basementFloorR`. They act on the ground surface design
temperature, `site.annualMeanF − site.groundAmplitudeF` (defaults 55 and 20 °F;
never above the indoor temperature). Summer gains below grade are zero.

**How the closed forms were checked.** `eval/basement-fd.mjs` solves 2-D steady
conduction in the soil around a long basement by finite volumes (0.25 ft cells,
Jacobi-preconditioned conjugate gradients, energy balance closes to 1e-10) and
compares the wall's and floor's loss with the closed forms
(`eval/basement-fd.txt`). Block (a) is the closed forms' own model (ground
surface the only sink, far sides insulated 80 ft out); block (b) holds the
deep ground 30 ft down at the annual mean.

- Walls: the closed form reads **10-11% low** on bare concrete at depths of 2,
  4 and 7 ft (16% low when the floor is insulated and its heat no longer
  shares the wall's soil), and **within 5%** with R-10 on the wall (+3%, -5%).
- Floors: it reads **5-43% low** against (a): the closed form treats the floor
  as if the wall were not there, but heat from the floor's edge leaves through
  the soil beside the wall, more so when the wall is insulated (-43% with R-10
  walls, -5% with R-10 under the floor). Against (b), with the deep ground
  warmer, it runs from 31% low to 24% high. In the cold-climate example below the
  floor is 4% of the house's heating load, so the gap is about 1% of the total;
  it is not corrected, and is stated on the how-it-works page.
- Grid check: at 0.5, 0.25 and 0.125 ft cells the 24 x 7 ft bare wall reads
  0.1957, 0.1962 and 0.1958; the floor rises 0.0362 to 0.0391 (it depends on
  the soil block's size more than the grid: 0.0274 at 20 ft, 0.0404 at 160 ft,
  0.0407 at 320 ft).

What it does (`node eval/basement-example.mjs`, `eval/basement-example.txt`):
the example ranch moved to 44°N (-5 °F winter design, annual mean 45 °F) over a
1,800 ft² conditioned basement 6 ft below grade needs 53,021 Btu/h of heat with
bare concrete, against 42,033 for the same house on its slab; R-10 on the
basement walls cuts the basement's below-grade wall loss from 9,468 to 2,943
and the house to 45,844. Illustrative inputs, not a measured house.

**Skylights.** `skylights: [{ areaFt2, tiltDeg, facing, uFactor?, shgc? }]` on a
room (defaults `envelope.skylightU` 0.55 and `skylightSHGC` 0.3, flat, facing
S). Heating is U × area × ΔT; cooling is conduction plus sun on the glass at
its tilt and facing, through the SHGC with the window angle modifier; the area
comes out of the room's attic ceiling. The light shaft through the attic is not
modelled. On the example ranch two 8 ft² skylights raise the sensible peak
from 19,732 to 21,091-21,420 Btu/h (2.19 to 2.31-2.33 tons) and move the peak
from 3 pm to 2 pm. Tests: `basement.test.mjs` (closed forms by hand, strips
summing to the whole wall, the 1/R limit, a coarse 2-D solve within 15%, room
sums, ground temperature clamp, skylight heating, flat-skylight noon gain,
validation).

## Duct sizing

`duct.mjs` and [`ducts.html`](ducts.html) (added 2026-11-11) take each room's
design airflow from the load and size the ducts by friction rate:

- **Design friction rate** = (blower external static pressure − coil, filter,
  supply register, return grille and other losses) × 100 / (longest supply
  total effective length + longest return total effective length), in in. w.c.
  per 100 ft. Component losses default to example values the page labels as
  placeholders; fitting equivalent lengths are always typed (no table built in).
- **Loss in a round duct:** Darcy-Weisbach with the Colebrook (1939) friction
  factor, air density at the site's elevation (the load's standard
  atmosphere), viscosity 1.217e-5 lb/ft·s, roughness 0.0003 ft for sheet metal
  and 0.003 ft for flex pulled tight (a rough assumption; sagging flex loses
  far more).
- **Size:** the smallest listed round size (4-24 in.) at or under the friction
  rate and a velocity limit (defaults 900 ft/min branches and trunks, 700
  returns, editable). Trunks carry the sum of the rooms named for them, with a
  rectangular equivalent at a set height by Huebscher (1948). Each run reports
  the static pressure its balancing damper must take up.
- **Check:** `duct.test.mjs` compares the engine with the widely quoted fit
  Δp = 0.109136 q^1.9 / D^5.02 for galvanized duct. Measured: at 0.0003 ft the
  engine is 3-9% lower over 50-2,000 cfm; at 0.0005 ft it is within 5%.
  Colebrook is also checked against Blasius (smooth) and von Kármán (fully rough).
- CLI: add a `ducts` block to the house file (`defaultEffectiveLengthFt`,
  `lengths` by room name, `returnEffectiveLengthFt` or `returns`, optional
  `trunks: [{ name, rooms }]` and any setting) and run
  `node cli.mjs house.json --ducts [--json]`; `node cli.mjs --example --ducts`
  shows the example ranch. The page's "Copy this design to the box" writes
  that block.

Not ACCA Manual D and none of its tables. Not modelled: trunks reducing section
by section, register throw and noise, duct heat gain and leakage, and the
blower's fan curve at the resulting pressure.

## Disclaimer, privacy, licence

No warranty. Results are estimates, not engineering advice and not an ACCA
Manual J report. Many permits require a load calculation from approved
software; buy equipment on a full calculation by a qualified designer.

Nothing you enter leaves your browser. An optional anonymous counter in local
storage records only that a calculation ran and the day; the page has a
switch to turn it off, and Do Not Track / Global Privacy Control are honoured.

MIT licensed (`LICENSE`). Sponsor: https://github.com/sponsors/Duncan-Haywood
