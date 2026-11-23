# One-member railings read as members (2026-11-23)

**Question.** `eval/beam-schema-twins-2026-11-23.md` left 14 Tekla railings
whose stored `Qto_RailingBaseQuantities.Length` the model fill matched in
the IFC2X3 export and missed in the IFC4 and IFC4X3 exports of the same
model. Why did they miss, and can the fill read them?

## The railings

The Tekla Structures Educational 2026 model from
`github.com/Hygros/ifc-kbob-ai-matcher` (MPL-2.0) at `88a8c59`, fetched by
`eval/fetch-qto-psets.sh` (not committed), has 16 railings. Each one is a
single member:

- 12 guardrail posts and 2 guardrail rails, `ROR57*5` (a 57 mm round tube with
  a 5 mm wall: `IfcCircleHollowProfileDef`, radius 28.5, wall 5). The posts
  stand upright, 1.1 m long, and the rails lie flat, 12.0 and 12.2 m long.
  These are the 14 that store a Length. (The earlier note called them IPE80s.
  The names in the file show they are tubes.)
- 2 handrails, one `IPE80` and one `L60*6`.

IFC2X3 writes each one as an extruded profile. IFC4 and IFC4X3 write a
tessellation: 16 side facets, and each end as an outer ring with a hole ring
wound the same way.

## Why the top-rail reading missed them

`railings.mjs` reads a railing's path along its top rail, and offers a
figure only when two readings of that rail agree: the strip (the top
surface's area and outline) and the sweep (volume over a cross-section cut
at the rail's largest face). On a tessellated tube:

- **an upright post** has no long top surface. Its strip read 1.1 m only
  because the upward-facing facets of the 16-gon run along the post. The
  sweep's cut took the tube's whole disc, hole included, as the section: 0.352
  m for 1.1.
- **a lying rail**: the same thing, 3.905 m for 12.2.

In IFC2X3 the extrusion is split into convex pieces, and the cut found the
ring, so the two readings agreed.

## The member reading (`railings.mjs` `prismLength`)

A railing that is one straight member is a prism. Each face either runs
along one axis (a side) or is square to it and lies in the plane of one of the
two ends. The new reading tries each face normal as that axis. Among the
axes the body passes, it takes the longest, because a box passes three. It
offers the body's length along that axis when the body is at least 10 times
longer than it is wide (`RAIL_ASPECT`, the same ratio the rail test uses).
It does not use the end faces' areas, so Tekla's hole rings with the same
winding do no harm. `railingLength` tries it only when the top-rail reading
offers nothing, and marks the result `from: "member"`.

What it turns down: a row of posts or balusters (each one is a prism, but
together the body is wider than a tenth of its height), a glass panel (not
slender), a tapered bar, and a bar with a skewed cut end (tests in
`railings.test.mjs`).

## Result

**The Tekla twins** (`node eval/beam-schema-twins.mjs 2X3.ifc 4.ifc 4X3.ifc`,
output `eval/one-member-railings-twins-2026-11-23.txt`): values read
differently by schema, 18 before and **4** after. The 4 left are the plates
that are missing from the IFC4X3 file.

**Tekla's `Qto_` sets** (`node eval/qto-psets.mjs` on the three twins and
`Tekla-Export.ifc`, output `eval/one-member-railings-qto-psets-2026-11-23.txt`;
before: `eval/qto-psets-after-twins-2026-11-23.txt`). `IFCRAILING Length`
values that geometry gives / that are within 2%:

| File | stored | before | after |
| --- | ---: | ---: | ---: |
| test-2026-2x3.ifc | 16 | 14 / 14 | **16 / 16** |
| test-2026-4.ifc | 32 | 0 / 0 | **16 / 16** |
| test-2026-4.3.ifc | 32 | 0 / 0 | **16 / 16** |

The IFC4 files store each railing's Length twice (32 values on 16 railings).
In IFC2X3 the two handrails (IPE80, L60*6) now read too: 8.046 m, on their
stored figure.

**Every public railing, before and after** (`node eval/railing-lengths.mjs
--all` on the 24 public files with an `IfcRailing`: the 36 files of
`eval/railing-lengths-2026-11-22.md`, the Hygros models and the SUVA test files):

| | before | after |
| --- | ---: | ---: |
| railings | 827 | 827 |
| store a Length (Revit, IfcOpenShell) | 82 | 82 |
| offered on those / within 2% | 41 / 41 | 41 / 41 (unchanged, one by one) |
| store none, would be filled | 149 | **195** |

None of the 41 railings checked against a stored figure changed (the member
reading runs only where the rail reading gives nothing, and none of the 41
remaining held-back ones is a prism). The 46 new fills:

- 34 in the three Tekla twins, the ones above;
- 12 in `schependomlaan.ifc` (ArchiCAD): `doorvalregel` bars, single 42 mm
  round bars across window openings (0.866 m, 1.030 m, and 0.778 m set
  diagonally in plan). The member reading gives the bar's own length. Before,
  8 had "no rail on top" and 4 had readings that disagreed (strip 0.810,
  sweep 0.778; the member reading agrees with the sweep). No figure is
  stored to check these against.

`node --test railings.test.mjs`: 9 pass (4 new). The venture suite: 533 pass.

## Next

- A railing drawn as one swept tube along a bent path (an
  `IfcSweptDiskSolid` handrail) is neither a top rail nor a prism. If a
  public export stores its Length, read it as the directrix's length.
- The 9 Revit railings whose readings disagree and the 16 with no rail on top
  stay as `eval/railing-lengths-2026-11-22.md` left them.
