# Void thresholds per work section, on 11 public models, 2026-11-20

**Question.** The small-void rule shipped earlier today
([measure-rules-2026-11-20.md](measure-rules-2026-11-20.md)) applied one pair
of thresholds (area, volume) to every element. Methods of measurement do not:
the threshold depends on the work section, and so does which figure it is
judged by. A void left in masonry is judged by its area; one left in in-situ
concrete by its volume; finishes have their own figure. With one pair, a slab
measured by its concrete volume also gets its *area* adjusted by the area
threshold, and a covering measured by area gets its volume adjusted. How
often does that happen on real models, and by how much?

**What shipped.** `measure.mjs`: `SECTIONS` (walls = IfcWall*, slabs and
roofs = IfcSlab/IfcRoof, coverings = IfcCovering, frames =
IfcBeam/IfcColumn/IfcMember, everything else), a rule's optional
`sections: { key: { areaMax, volumeMax } }` (a section it leaves out, or a
number a section leaves out, takes the rule's own pair), `ruleFor`,
`ruleLabel` (the rule in words, now the BoQ CSV's heading) and `parseRule`
(the CLI text). The page gains a "By work section" preset and, under Custom,
a "per work section" table. CLI:
`--voids-up-to "0.5,0.05;slabs=0,0.05;coverings=0.5,0"`.

The preset ("by work section") is: walls 0.50 m2 / 0.05 m3, coverings
0.50 m2 by area only, slabs and roofs 0.05 m3 by volume only, frames 0.05 m3
by volume only, everything else every opening deducted. It is a starting
point shaped like UK practice (masonry by area, concrete by volume), not any
standard's text, which this run could not reach; the page and README say so.

**Method.** `node eval/measure-rules.mjs <11 files> --json
eval/measure-sections-2026-11-20.json`, output in
`measure-sections-2026-11-20.txt`. The script now also sums beams, columns
and members into the measured totals (so base volumes differ from the earlier
file's for models with framing). Models: the 11 of the earlier run that
download today, from blob-less sparse clones of `opensourceBIM/IFC-files`
(`cb96c50`: HHS Office construction and architect, OpeningDesign
Schultz_Residence) and `ThatOpen/engine_web-ifc` (`d1962b41`,
`tests/ifcfiles/public/`: AC20-FZK-Haus, C20-Institute-Var-2,
kleine_Wohnung_R22, schependomlaan, ARK_NUS_skolebygg, duplex,
Office_A_20110811, dental_clinic). Mini Project (Tekla), in the earlier run,
was not cloned this time.

**Result.** On 7 of 11 models the per-section rule and the single
0.50 m2 / 0.05 m3 pair give the same bill. On the other 4, the single pair
moves figures the per-section rule leaves alone:

| Model | Single pair moves | Per section |
|---|---|---|
| HHS architect (Revit) | slab area +7.210 m2 (0.172%) from 102 small slab openings | slab area unchanged; slab volume +1.081 m3 in both |
| kleine_Wohnung_R22 | slab area +2.932 m2 (0.169%) | slab area unchanged; slab volume +0.240 m3 in both |
| ARK_NUS_skolebygg | slab area -2.207 m2 (a gross figure with its larger openings taken out) | slab area unchanged; slab volume +0.022 m3 in both |
| schependomlaan | covering volume +0.040 m3 (0.041%) | covering volume unchanged; covering area +0.644 m2 in both |

Wall figures are the same under both on every model (the preset's wall pair
is the single pair). The openings counted under the area threshold fall from
106 to 4 in HHS architect, 14 to 2 in kleine_Wohnung and 52 to 49 in
ARK_NUS: the rest were slab openings that a volume-measured slab should not
count by area.

**What it means.** The amounts are small (under 0.2% of any class's total),
because these models have few small openings. They are not zero, and they
land on the line an estimator prices by area (a slab's soffit formwork or
finish area) with an adjustment the method does not make. On a model with
many floor penetrations (services-heavy buildings) the difference grows with
the count of penetrations under the threshold.

**Not checked.** No written standard was read for the preset's numbers
(the earlier run reached only course extracts); a quantity surveyor's
measured bill of one of these models would be the outside check, and none is
public. The rows the rule leaves as modelled (overlapping openings, ARK_NUS's
29) are unchanged.

**Tests.** `measure.test.mjs`: sections by class, fallbacks, parsing and
typos, the label, a walls-only pair on the sample (only the wall line moves,
+2.1 m2 / +0.42 m3), a hand-made slab taking the volume threshold and not
the area one.
