# PV Row Spacing Optimizer

A free browser tool for solar developers, EPC estimators and designers: **give the site, a typical-year weather file and your costs, and get the row spacing (ground coverage ratio) and tilt that pay best**, for fixed-tilt racks and backtracking single-axis trackers side by side.

**Live tool:** https://marisstella.app/pv-row-spacing-optimizer/ · **Guide:** [solar row spacing: the 9-to-3 rule against the money answer](https://marisstella.app/pv-row-spacing-optimizer/solar-row-spacing-gcr.html)

After using this, you can **pick a spacing and tilt to take into detailed design from your own land price, energy value and weather**, instead of the winter-solstice 9-to-3 rule or a clear-sky rule of thumb, and see whether trackers earn their premium on your site.

## Why someone would use it

| Today's option | What it does | What this does better |
|---|---|---|
| The 9-to-3 winter-solstice rule | Shade-free rows 9:00-15:00 on Dec 21 | Prices every spacing with your land, capital, O&M and energy value; at 55° N the rule cost $7.21/MWh on a real typical year |
| PVsyst, PlantPredict, SAM | Full yield models, one layout at a time, paid or desktop | Sweeps every tilt and GCR (about 2,000 layouts) in a second in the browser, then ranks them by money |
| Layout platforms (site-design SaaS) | Draws the plant on the parcel; per-seat pricing | Free, no account, the answer before you buy a seat |
| pvlib scripts | Exact physics, if you write the code | The same physics (checked against pvlib), no code |

Path to revenue (payment rails off): free tool and lead magnet for a paid layout service. Natural paid paths, each needing the owner: a parcel-aware version that reads a boundary and setbacks and counts tables, and a branded PDF for developers taking a site to a landowner or investor.

## Model

**Sun and weather (`solar.mjs`, `weather.mjs`).** NOAA's solar position equations at every step of a year. Weather is a typical-year file read in the browser (PVGIS TMY CSV, NSRDB PSM CSV, NREL TMY3, or any CSV with a time column and GHI, DNI and DHI), or, without one, the Ineichen-Perez clear sky with a typed Linke turbidity. A file's own latitude and longitude win, and beam reported while the sun is computed to be down (a time-zone mistake) is flagged.

**Rows (`rows.mjs`).** Long, parallel rows on flat ground, worked in the plane across the rows (PVsyst's unlimited sheds, pvlib's infinite sheds). Shaded share of the table width: `fs = 1 - s_up / (GCR * cos AOI)`. Width-averaged sky view past the row in front: `VF = (1 + p - sqrt(1 + p^2 - 2 p cos tilt)) / 2`, p = 1/GCR, derived in closed form by integrating `(1 + cos(psi + tilt))/2` over the face (a test checks it against the numeric integral). Diffuse is split by Hay and Davies: circumsolar shaded with the beam, the rest scaled by VF. Electrical effect: any shadow in a bypass-diode band removes that band's beam and circumsolar light (PVsyst's "according to strings"). Trackers: true tracking, Anderson and Mikofski (2020) backtracking, rotation limit. ASHRAE incidence-angle modifier on the beam, NOCT cell temperature, -0.35%/C, and one other-losses share. Ground-reflected light is the open-field value, not reduced by the rows (at most about 0.6% of GHI at 25° tilt and 20% albedo).

**Money (`calc.mjs`).** Land per kWp = module area / GCR x (1 + overhead). Land-limited: capacity fills the acres. Capacity-limited: the acres follow the rows. NPV = energy x price over the life with degradation, minus installed cost (plus the tracker premium for trackers), O&M and land lease, discounted. Layouts are ranked by NPV, or by cost per MWh when none pays (the highest NPV of a losing plant is just the smallest plant) or when asked. The 9-to-3 rule's GCR at the best tilt is priced the same way for comparison. About 2,100 fixed layouts and 51 tracker spacings take 0.2 s in Node on hourly data.

## Checked

*Against pvlib-python 0.16.1* (`check/pvlib_reference.py` writes `check/pvlib_reference.json`; `reference.test.mjs` runs without Python):

- sun position at 300 seeded instants (2000-2040, latitudes to 60°): within 0.013° of NREL's SPA in zenith and azimuth;
- Ineichen-Perez clear sky at 200 seeded cases: within 0.01 W/m2;
- fixed-row shaded fraction (`pvlib.shading.shaded_fraction1d`) at 300 cases and tracker rotation with and without backtracking (`pvlib.tracking.singleaxis`) at 300: identical (1e-9 and 1e-6);
- a whole clear-sky year at 35° N through `pvlib.bifacial.infinite_sheds` (isotropic sky) on three fixed and two tracker layouts: annual direct and sky-diffuse light on the rows within 0.04%, with the engine's own sun and clear sky.

*On real weather* (`check/tmy3_measure.mjs`, output `check/tmy3_results.json`): the page's defaults on the two NREL TMY3 files pvlib redistributes, ranked by cost per MWh.

| Site | Cheapest fixed | 9-to-3 rule | Clear-sky design | Clear-sky yield vs real |
|---|---|---|---|---|
| Greensboro, NC, 36.1° N | 26°, GCR 0.40, $74.15/MWh | GCR 0.509, +$0.26/MWh | 32°, 0.44, +$0.31/MWh | 1958 vs 1391 kWh/kWp |
| Sand Point, AK, 55.3° N | 36°, GCR 0.24, $124.00/MWh | GCR 0.088, +$7.21/MWh | 40°, 0.23, +$0.16/MWh | 1639 vs 847 kWh/kWp |

Two files, the only two reachable from the build machine (the PVGIS and NSRDB services were refused by the network); a survey of many sites is the next measurement.

Not checked: any built plant's metered output, sloped ground, horizon, row ends, bifacial gain, snow and clipping (not modelled), and how spacing changes cable and racking cost (put it in the installed cost or the overhead).

## Files

`index.html` (the tool), `solar-row-spacing-gcr.html` (guide), `solar.mjs`, `weather.mjs`, `rows.mjs`, `calc.mjs` (engine; `analyze(input)`, `DEFAULTS`, `sampleInput()`), `usage.mjs` (local-only feature counts, off under Do Not Track), tests `*.test.mjs` (`node --test *.test.mjs`), `check/` (pvlib reference and the TMY3 measurement).

FSL-1.1-MIT licensed.
