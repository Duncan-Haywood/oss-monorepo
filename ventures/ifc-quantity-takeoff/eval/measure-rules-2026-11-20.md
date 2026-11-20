# Leaving small voids in: a method-of-measurement rule on 12 public models, 2026-11-20

**Question.** A model's net area or volume takes out every opening, however
small. Written methods of measurement usually do not: they leave small voids
in, so a pipe sleeve is not deducted from a wall's plaster or a slab's
concrete. Can the takeoff apply such a rule from the geometry, exactly, and
how much does it move a bill of quantities on real models?

**What shipped.** `measure.mjs` (rule), `qto.mjs` (each opening cut on its
own), the page's "Openings" control under the bill of quantities, and
`cli.mjs --voids-up-to AREA,VOLUME`. A rule is two thresholds: an opening
whose area in the measured section (a wall's middle plane, a slab's plan) is
at most `areaMax` m2 is not deducted from the area; one that takes at most
`volumeMax` m3 out of the body is not deducted from the volume. The presets are
"deduct every opening" and "0.50 m2 / 0.05 m3". These are thresholds that
appear in UK measurement practice (for example, for masonry and in-situ
concrete), but the rules differ by standard, edition and work section, and
the sources this run could reach were course extracts, not the standard. So
the page and README name no standard: the user sets the numbers their
contract's method gives.

**Method.** For each element with `IfcRelVoidsElement` openings, `qto.mjs`
subtracts each opening from the body by itself and records what it takes
out, the volume and the area in the BoQ's section. The rule then adjusts the
figure the BoQ already sums (`rowQuantities`):

- a net figure (stored NetVolume / NetSideArea / NetArea, or the computed
  net) gets the small voids added back;
- a gross figure (stored GrossVolume / GrossSideArea / GrossArea that the
  geometry check confirms is gross) gets the large openings taken out;
- a figure of unknown basis (a bare `Area`, or a stored figure the check
  says is wrong) is used as it is, and the row says why.

Adding a void back is exact only when the openings' separate deductions sum
to what they take out together (no overlap, nothing hanging past the
element's edge, to 0.5%). Where they do not, the element is left as modelled
and counted under "rows the rule could not adjust".

`node eval/measure-rules.mjs <files> --json eval/measure-rules-2026-11-20.json`,
output in `measure-rules-2026-11-20.txt`. Models: the 8 of
[areas-vs-stored-2026-11-19.md](areas-vs-stored-2026-11-19.md) (sparse clones
of `opensourceBIM/IFC-files` and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/`) plus duplex, Office_A_20110811, dental_clinic
(engine_web-ifc) and OpeningDesign's Schultz_Residence (IFC-files).

**Outside check.** Some exporters store each opening's own Width and Height.
For openings through walls, the area this tool cut for the opening on its own
was compared with Width x Height: **1,099 of 1,136 agree within 2%** (all 99
in HHS architect, 283 of 283 in C20-Institute, 60 of 60 in schependomlaan).
Of the 37 that do not, 2 are AC20-FZK-Haus's round windows (cut 0.785 m2
against a 1 x 1 m box: pi/4, the cut is right), 31 are ARK_NUS openings that
barely meet the wall that names them (cut 0.012 to 0.058 m2 against
2.9 to 3.7 m2: the opening body sits mostly outside that wall), and 4 are
kleine_Wohnung door openings that do not reach the wall's middle plane (0 or
part of 2.15 m2). Those last two groups are open: they may be openings placed
on the wrong host, or recesses.

**Exactness.** Of 1,003 elements whose openings were cut for volume, 993 have
separate deductions summing to the joint one; the 10 that do not are all in
ARK_NUS (overlapping openings), and the rule leaves them as modelled. For
areas, 931 of 941.

**Results.** 2,252 openings in the 12 models.

| Model | Openings | At or under 0.50 m2 | Walls/slabs area change at 0.50 / 0.05 | At 1.00 / 0.10 |
|---|---|---|---|---|
| HHS Office architect | 218 | 106 | +7.23 m2 (+0.08%), +1.09 m3 | +7.23 m2, +1.16 m3 |
| kleine_Wohnung_R22 | 168 | 14 | +2.93 m2 (+0.07%), +0.24 m3 | +2.93 m2, +0.66 m3 |
| schependomlaan | 79 | 2 | +0.64 m2 (+0.01%), +0.12 m3 | +2.93 m2, +0.12 m3 |
| ARK_NUS_skolebygg | 789 | 52 | -2.21 m2 (gross slab figures with large openings taken out), +0.02 m3 | -1.23 m2, +0.02 m3 |
| Office_A_20110811 | 181 | 6 | +2.47 m2 (+0.03%), +0.36 m3 | +12.91 m2 (+0.14%), +0.48 m3 |
| dental_clinic | 403 | 29 | +10.65 m2 (+0.07%), +1.31 m3 | +14.60 m2 (+0.09%), +1.50 m3 |
| Schultz_Residence | 53 | 7 | +1.66 m2 (+0.21%; walls +0.35%), +0.04 m3 | +11.10 m2 (+1.41%; walls +2.35%), +0.56 m3 |
| duplex | 48 | 0 | 0 | +7.46 m2 (+0.49%) |
| AC20-FZK-Haus | 17 | 0 | 0 | +1.57 m2 (+0.27%) |
| C20-Institute, HHS construction, Mini Project | 296 | 0 | 0 | 0 |

216 of 2,252 openings (9.6%) are at or under 0.50 m2 in their element's
section, 227 at or under 0.05 m3. At the model level the rule moves the wall
and slab area by under a quarter of a percent at 0.50 m2 and by up to 1.41% at
1.00 m2 (Schultz_Residence's walls, +2.35%). That is small next to the
stored-figure faults the check already finds (one stored GrossVolume in
eight wrong), but it is the difference between a takeoff that matches the
measured bill a quantity surveyor writes and one that does not, and it lands
on the lines priced per m2 (plaster, paint, formwork, blockwork).

In HHS Office architect almost all of the change is on the slab line (+7.21
m2 and +1.08 m3 of the +7.23 m2 and +1.09 m3).

**What is left.** The 35 openings that barely meet their host (ARK_NUS 31,
kleine_Wohnung 4); thresholds per class or work section (a single pair now
applies to walls, slabs and coverings alike); the change report
(`diff.mjs`) still compares as modelled; a classification-code mapping
(Uniformat / MasterFormat) is the other half of a method-of-measurement layer
and is not started.
