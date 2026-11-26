# Detention Pond Sizer

A free browser tool and CLI for site civil engineers, land planners and builders: **enter the drainage area, the
curve number and time of concentration before and after development, a small and a large design storm and the basin
footprint, and get the orifice diameter, the weir length and crest, and the basin depth that keep each storm's
post-development peak outflow at its pre-development peak.** NRCS curve-number runoff, the NRCS triangular unit
hydrograph and level-pool routing. Nothing is uploaded.

**Live tool:** https://marisstella.app/stormwater-detention-sizer/ ·
**Guide:** [how to size a detention pond](how-to-size-a-detention-pond.html)

After using this, you can **lay out a basin and its two-stage outlet before a full model run, and check a model
someone else ran**: in the built-in example (5 acres, CN 61 to 85, 100 x 60 ft bottom, 3:1 sides), a 4.6 in
orifice and a 0.62 ft weir at 2.05 ft hold the 2-year peak to 0.76 cfs and the 100-year to 8.21 cfs in a basin
5.33 ft deep. The example's storm coefficients are illustrative and belong to no real place.

## Model

- Rain: alternating-block hyetograph from intensity = a / (t + b)^n (in/hr, t in minutes) over the storm duration.
- Runoff: NRCS curve number on cumulative rain, Q = (P - Ia)² / (P - Ia + S), S = 1000/CN - 10, Ia = 0.2 S.
- Unit hydrograph: NRCS triangular, Tp = Δt/2 + 0.6 Tc, qp = PRF x A(sq mi) / Tp (PRF 484 by default), base set
  so it carries exactly 1 inch; ordinates are step means of the triangle, so volume is conserved exactly.
- Basin: rectangular bottom with side slopes z:1, exact prismoidal storage L W h + (L + W) z h² + 4/3 z² h³.
- Outlet: circular orifice at the invert, Cd A √(2g(h - d/2)) above the crown and scaled by (h/d)^1.5 below it;
  sharp-crested weir Cw L (h - crest)^1.5, Cw 3.33.
- Routing: storage-indication (modified Puls), each step solved for the level by bisection (no table interpolation).
- Sizing: orifice by bisection so the small storm's peak out equals its allowable; weir crest at that storm's peak
  level; weir length by bisection so the large storm's peak out equals its allowable; depth = the highest peak level
  of any storm + freeboard.
  Allowable = the pre-development peak of the same storm unless entered.

Not modelled: NRCS 24-hour distributions and Atlas 14 temporal patterns, multiple subareas and reaches, infiltration,
tailwater, barrel or culvert control, the emergency spillway, water-quality and channel-protection volumes, metric units.

## Known gaps

From [quality round 108](../../portfolio/quality/audits/2026-11-26-stormwater-detention-sizer.json):

- **The weir has no end contractions and no head-to-length check.** Francis without contractions is a suppressed
  weir (crest as wide as its channel). The worked example sizes a 0.62 ft weir running 2.27 ft deep (H/L about 3.7),
  where a contracted rectangular weir, L' = L - 0.2 H, passes about 3.2 cfs, not 8.2, and the 100-year stage is about
  0.9 ft higher. Treat the weir length as a screening number until contractions and a riser or slot option land.
- **No NRCS Type II/III 24-hour distribution**; the hyetograph is an alternating block from the IDF.
- Neither warning threshold (coarse time step, small orifice) has a test.

## Spec sources

The professional who would sign this off: a licensed civil (water resources) engineer; none has yet. Rules: USDA NRCS National Engineering Handbook part 630,
chapter 10 (runoff equation; TR-55 eq. 2-3) and chapter 16 (triangular unit hydrograph, PRF 484); Chow, Maidment and
Mays, *Applied Hydrology* (1988), sections 8.2 (level-pool routing) and 14.4 (alternating-block storm). Tests pin
hand calculations (runoff at CN 80 and 61, unit hydrograph peak for 1 sq mi, basin volume, orifice and weir flows),
the exact linear-reservoir solution, mass conservation and an independent RK4 integration (peaks within 0.5 %).
**Unverified** against HydroCAD, HEC-HMS or a reviewed design.

## Run

Open `index.html` through any static server. CLI: `node cli.mjs [--areaAc 8 --postCN 90 ...] [--csv]`.
Tests: `node --test detention.test.mjs page.test.mjs usage.test.mjs`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not engineering, legal or code-compliance advice, and it does not replace a licensed
professional engineer. **You are responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Independent of software makers, agencies and standards organisations.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`pond_sized`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free to use and source available (FSL-1.1-MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
