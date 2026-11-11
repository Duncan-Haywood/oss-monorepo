# Room-by-room HVAC load calculator

**Live:** https://marisstella.app/hvac-load-calc/ · [How it works](https://marisstella.app/hvac-load-calc/how-it-works.html)

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
- Tests: `node --test load.test.mjs page.test.mjs` (hand-calculated U-values,
  solar geometry, psychrometrics, room heating sums, diversity, validation).

## Disclaimer, privacy, licence

No warranty. Results are estimates, not engineering advice and not an ACCA
Manual J report. Many permits require a load calculation from approved
software; buy equipment on a full calculation by a qualified designer.

Nothing you enter leaves your browser. An optional anonymous counter in local
storage records only that a calculation ran and the day; the page has a
switch to turn it off, and Do Not Track / Global Privacy Control are honoured.

MIT licensed (`LICENSE`). Sponsor: https://github.com/sponsors/Duncan-Haywood
