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
(no overhang shading, no basements or skylights, instant window gain) are
listed on the how-it-works page.

## Use

- Browser: open `index.html` (any static server), edit rooms, Calculate.
  Import and export the house as JSON; download the room table as CSV.
- CLI: `node cli.mjs house.json` (the same JSON the page exports) or
  `node cli.mjs --example --json`.
- Tests: `node --test load.test.mjs page.test.mjs duct.test.mjs` (hand-calculated U-values,
  solar geometry, psychrometrics, room heating sums, diversity, validation).

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
