# ArchiCAD measures arcs as 45-degree chords and round columns as circumscribed 20-gons, 2026-11-23

Follows [side-lights-2026-11-22.md](side-lights-2026-11-22.md), which left two
zinc copings on schependomlaan (#740000, #740117) whose stored section is 3.6%
over the profile they export, and said there was no rule to name without a
second ArchiCAD profile to compare. This run looked for that second profile
inside the corpus instead of outside it, and found nine.

**Data.** The same 13 public models as the 2026-11-22 run
(`opensourceBIM/IFC-files` `HHS Office/` construction and architect;
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`), blob-less sparse
clones, not committed. Rerun:
`node eval/stored-vs-computed.mjs <13 files> --json eval/stored-vs-computed-2026-11-23-polygon.json`
(output in `stored-vs-computed-2026-11-23-polygon.txt`).

## Every ArchiCAD extrusion with an arc in its profile

The five ArchiCAD exports in the corpus (schependomlaan, AC20-FZK-Haus,
C20-Institute-Var-2, ISSUE_126, S_Office) hold extrusions of drawn
(`IfcArbitraryClosedProfileDef`) profiles with trimmed-circle arcs on two
models. Only schependomlaan's carry ArchiCAD's own `End Surface Area` and
`Net Volume`. Besides the two copings there are two such profiles:

| Profile | Elements | Arcs | Exact section mm2 | Stored (End Surface Area / 2 = Net Volume / length) | Arcs as 45-degree chords |
|---|---:|---|---:|---:|---:|
| `IFC_stalen_ligger_L100x10` (steel angle, IfcBeam) | 6 | fillet r 12, toes r 8, 90 degrees each | 1,903.434 | 1,904.686 | **1,904.686** |
| `IFC_Vebo_spekband_SB 60/70x150` (sill, IfcCovering) | 3 | groove r 10, 180 degrees | 10,142.959 | 10,158.612 | **10,158.612** |
| `IFC_zinken_afdekker_laagbouw` (zinc coping) | 2 | bands r 20 and r 19, 225 degrees | 396.336 | 410.611 | 388.703 |

The beams' `CrossSectionArea` (Qto_BeamBaseQuantities) is the exact
1,903.434; ArchiCAD's own `End Surface Area` and `Net Volume` are not. They
equal the section with every arc replaced by equal chords of 45 degrees, to
all seven printed digits on both profiles. Chords of 30, 22.5, 15 or 10
degrees miss by 0.7 to 15 mm2 (tried, `/tmp` script, not kept): 45 is the only
step that fits both. A concave arc (the sill's groove, the angle's root
fillet) gains area under its chords and a convex one (the angle's toes) loses
it, which is why the stored figures are above the exact ones.

## The round column: a circumscribed 20-gon

C20's two round columns (Stütze-001, `IfcCircleProfileDef` r 100 mm, 2.7 m)
store NetVolume and GrossVolume 0.0855275977753 m3 against the circle's
0.0848230016 (0.83% over, inside the 2% agreement). That is
20 x 0.1^2 x tan(9 degrees) x 2.7 = 0.08552759778, the 20-sided polygon whose
sides touch the circle, and the stored `OuterSurfaceArea` 1.71055195551 m2 is
that polygon's perimeter times 2.7, to the 11th digit. So ArchiCAD's column
tool draws a circle differently from its profile tool: tangent sides, 18
degrees each. (The same columns' `CrossSectionArea` of 1.2566 m2 is still
not this figure; it stays in the 14 unexplained areas.)

## Rule `polygon-section`

`polygonSections` (geom.mjs) computes both polygonised sections for the
profile an element is swept from (the extruded profile, through half-space
clips only, as for `simplified-section`): every arc of a drawn profile as
chords of at most 45 degrees, and every circle as a circumscribed 20-gon.
`explainChecks` names a stored volume `polygon-section` when stored/computed
equals one of those ratios to 1e-4, whether or not it is inside the 2%
agreement. The geometry, which follows the true arcs, is then what the bill
of quantities sums. The effect is 0.07% to 1% per element, so it changes no
totals a reader will notice; what it adds is a named cause where the page
used to say "agrees" over a residual it could not explain.

The tolerance is tight on purpose. The differences it names are 0.066%
(angles), 0.154% (sills) and 0.83% (columns), and it asks for 1e-4 of the
ratio. Across the 13 models 333 elements get a polygon variant and 307 of
them store a volume; 11 match and 296 do not: Tekla's 274 tubes, angles and
channels in ISSUE_021 (already named `simplified-section` where they
disagree: inscribed 8- and 16-gons, no fillets), 14 Revit elements on
skolebygg, and schependomlaan's 2 copings and 6 others. No element outside
ArchiCAD matches, which is what a chance hit at this tolerance would look
like if it happened.

Result on the 13 models: **19 volume pairs on 11 elements** named, 15 on
schependomlaan (6 angles x gross and net, 3 sills x net) and 4 on C20 (2
columns x gross and net). All 19 were inside the 2% before and stay agreeing;
the count of disagreements is unchanged. (The only other difference from the
2026-11-22 output is kleine_Wohnung's 6 surfaces of revolution, now read by
an engine change merged since; not this rule.)

## The copings are not this

With 45-degree chords the coping's section drops to 388.703 mm2, further from
the stored 410.611, because its outer band (r 20, convex) loses more under
chords than the inner (r 19, concave) gains. Every pair of chord counts 1 to
39 on the two arcs, inscribed or circumscribed, was tried: the nearest hits
(23 and 10 chords, 0.007 mm2 off; circumscribed 8 and 22, 0.003 mm2) are
what 6,000 combinations give by chance and follow no step. The stored side
areas (403.04 and 409.99 mm per metre) fit neither the exact nor the chorded
outline. So the copings' extra 14.27 mm2 is not polygonisation; they stay
unexplained, and the BoQ already sums their geometry. A second ArchiCAD
model with thin bent-sheet profiles (flashings, gutters) is what would test
them next.

## What this does not show

- Two drawn profiles on one model, two columns on another. The 45-degree
  step fits seven digits on both profiles and no other step fits either, but
  whether ArchiCAD keeps it for long arcs of large radius (a curved wall's
  profile, a round slab edge) is untested: no such element in the corpus
  stores ArchiCAD's End Surface Area.
- Whether the 20-gon holds for other column diameters, or depends on the
  diameter, needs a model with more than one round column size.
