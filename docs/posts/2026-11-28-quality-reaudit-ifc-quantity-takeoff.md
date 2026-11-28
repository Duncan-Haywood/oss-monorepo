---
title: "Re-audit: the IFC takeoff now weighs unquantified steel and meets the bar"
seo_title: "Steel weight from an IFC model with no quantity sets"
date: 2026-11-28
tags: [quality-audit, evaluation, construction, estimating, ifc-quantity-takeoff]
description: "IFC Quantity Takeoff re-checked against its 2026-11-22 audit: five of seven defects closed, all seven seeded bugs caught, and it now meets the bar."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) turns an
IFC model into a bill of quantities and checks every stored volume against
the geometry. The [2026-11-22 audit](../../portfolio/quality/audits/2026-11-22-ifc-quantity-takeoff.json)
found seven defects. It missed the bar on verification: three of six seeded
bugs got past the tests. For an estimator the worst gap was steel. A beam or
column with no stored quantity set showed 0 m and 0 kg, so a per-metre or
per-kilo rate priced it at nothing. This re-check tested all seven defects
against the code on `main` today. The full record is in the
[re-audit file](../../portfolio/quality/audits/2026-11-28-ifc-quantity-takeoff-reaudit.json).

**Verdict: meets the bar.** All seven dimensions score 3. Here is what was
checked and what still falls short of a senior quantity surveyor's standard.

## What was recomputed

The test inputs were two IFC files written by hand for this audit, not taken
from the author's samples. They are committed in
[`eval/audit-2026-11-28/`](../../ventures/ifc-quantity-takeoff/eval/audit-2026-11-28/README.md),
so anyone can run them again. All six outputs matched the hand figures:

| element | by hand | tool |
|---|---|---|
| IPE 300 beam, 6 m, no quantity set | 53.81 cm² (steel table), 6 m, ≈253 kg (table 42.2 kg/m) | 53.81 cm², 6 m, 253.5 kg |
| RHS 200×100×8 post, 4 m, no corner radii | 4,544 mm², 142.7 kg | 4,544 mm², 142.7 kg |
| 4 × 0.2 × 3 m wall, 1.2 × 1.0 m window | 2.4 gross, 2.16 net m³; 10.8 m² net side | 2.4 / 2.16 / 10.8 |
| revolved ring, 100 × 200 mm at radius 500 | 2π × 0.5 × 0.02 = 0.062832 m³ | 0.062832 |
| round column r 250, 3 m | 0.589049 m³ | 0.589049 |
| 500 × 400 × 25 cm slab, centimetre units | 5 m³, 20 m² | 5, 20 |

The weights use 7,850 kg/m³, the usual design density for structural steel.
The 0.3 kg gap on the IPE comes from rounding in the steel table, not from
the tool.

## The seven earlier defects

- **Closed: the three bugs the tests missed.** These were an ellipse's axis
  ratio, a revolve axis set off the origin, and the centimetre unit prefix.
  Each one now fails a test. Four new seeded bugs, in steel density,
  steel weight, computed length and the switch that sums the geometry
  instead of a disputed stored figure, were all caught as well. 7 of 7.
- **Closed: steel by length and mass.** A member with no stored length now
  takes the length of its body along the extrusion. A steel member with no
  stored weight gets volume × 7,850 kg/m³, and the BoQ says where the
  figure came from.
- **Closed: a stored volume that disagrees for no known reason.** The test
  wall stored 2.376 m³ against 2.16 m³ of geometry. The BoQ line now shows
  both sums, and `--unexplained geometry` sums the geometry instead.
- **Closed: the two stale figures** on the page and in the README.
- **Was still open, fixed in this PR: revolved and primitive bodies had
  nowhere to sit.** A revolved solid, cylinder, sphere or cone gets its
  volume from a formula and has no faces. Without faces it had no bounding
  box, so its Uniformat basis said "geometry not read", and the rules that
  place an element under a slab or inside a room skipped it. Each body now
  carries bounding points. For a revolve that is every profile corner swept
  along a polygon that encloses its arc; for a primitive, the corners of its
  placed box. Two new tests cover this, and both fail if the fix is
  reverted.
- **Open: module size.** `geom.mjs` has grown from 2,013 to 3,227 lines and
  `qto.mjs` from 1,367 to 2,001. The page's BoQ notes are still a single
  line of about 1,800 characters. It works, but it is slow to review.

## What is still short of a quantity surveyor's standard

These limits are all stated in the tool's own docs:

- Girthed, extra-over and built-in-member rules are left to the user.
- Hollow sections with no stored corner radii are measured with square
  corners, exactly as modelled.
- No quantity surveyor has reviewed it.

The figures here were checked against formulas and steel tables, not against
a second takeoff program. That is why correctness scores 3 and not 4.
