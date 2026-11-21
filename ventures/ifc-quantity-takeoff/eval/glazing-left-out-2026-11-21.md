# ArchiCAD windows store their frame without the glass: 83 unexplained NetVolumes to 6, 2026-11-21

Follows [netvolume-causes-2026-11-21.md](netvolume-causes-2026-11-21.md),
which left 83 stored NetVolumes on the 13 public models with no named cause.
81 were schependomlaan's ArchiCAD windows (63) and doors (18), stored 29 to
70% under their bodies. Identical bodies stored different figures (0.08143
and 0.07986 m3 on two "merk B1" windows of 0.11359 m3), which looked like a
figure that depends on the wall the window sits in.

**Data.** The same 13 models at the same commits
(`opensourceBIM/IFC-files` `cb96c50`, HHS Office architect and construction;
`ThatOpen/engine_web-ifc` `5ba2467`, `tests/ifcfiles/public/`), blob-less
sparse clones, not committed. Rerun: `node eval/stored-vs-computed.mjs <13
files> --json eval/stored-vs-computed-2026-11-21-glazing.json` (output in
`stored-vs-computed-2026-11-21-glazing.txt`).

## What the file says

Every one of the 81 stores the same number twice in its ArchiCAD quantity
sets: `Net Volume` and `W/D Opening Volume` (window #47471: 0.08142468 both,
beside a `W/D Opening Nominal Volume` of 0.255189 = 1.21 x 1.85 x 0.114 m).
Its body is ten faceted breps: nine styled "RAL 9001" (the frame and sash,
0.081425 m3 together) and one styled "Glas - algemeen" (0.032165 m3), a
surface style with transparency 0.49. Body less pane: 0.113590 - 0.032165 =
0.081425, the stored figure. The second "merk B1" stores 0.079856 because its
pane is 0.033734 (its frame is drawn as eight pieces, not nine): the figure
depends on the pane, not the wall. A door (#77756, "merk F-R") has two panes
of 0.028421: 0.198417 - 0.056842 = 0.141575, the stored 0.141575483563.

## The rule

`glazing-left-out` (`qto.mjs`, the code the page runs): for an IfcWindow or
IfcDoor, the body's glass items are the representation items whose styled
item carries a surface style named glass as a whole word (glas, glass,
glazing, vitrage, verre, vidrio, vetro) or rendered part see-through
(transparency above 0 and below 1). Mapped items are followed into their
representation map, scaled by the mapping operator's determinant. When the
stored volume equals the body less those items within 0.5% (a quarter of the
agreement tolerance: both terms are the file's own geometry), the cause is
named and the BoQ sums the whole body, panes included.

Two traps the rule avoids, both in this file: ArchiCAD's insulation style is
"Isolatie - glaswol-steenwol" (glass wool), which a plain substring test calls
glass; and the "Lucht" (air) style renders at transparency 1. The planted test
in `engine.test.mjs` covers both, a pane mapped in at scale 2, and a stored
figure 3% under the frame that stays unexplained.

## Result

| NetVolume pairs (13 models) | before | after |
|---|---:|---:|
| pairs | 6,405 | 6,405 |
| agree | 6,172 | 6,172 |
| glazing-left-out | - | **77** |
| **unexplained** | **83** | **6** |

The 77 fit to 0.018% at worst. No row on the other 12 models changed (diff
of the two outputs, timings aside), and no GrossVolume row moved.

**Not every ArchiCAD object does this.** Grouped by the ArchiCAD library
part (the `Library Part Name` property) over the 148 schependomlaan windows
and doors with glass in their body:

| Library part | glazing-left-out | stored = whole body | left |
|---|---:|---:|---:|
| R1 18 (windows) | 59 | - | - |
| R2 stolp 18 | 4 | - | - |
| D2R 18, D2R bl 18 | 9 | - | - |
| D2R 2zl 18 | 4 | - | 4 |
| D1R bl 18 | 1 | 7 (glass under 2%) | - |
| D1R 18 | - | 4 (glass 17-18%) | - |
| 32_KD_berkvens_BA, 14047_raam_topgevel | - | 56 (glass under 2%) | - |

So the four "D1R 18" doors store the whole body, glass included, while the
other "18" library parts store the frame. Which figure an exporter writes is
the object's choice, so the rule names the cause only where the subtraction
is exact, and leaves the rest alone.

**The 4 left** ("D2R 2zl 18", merk E1-R and E5-R): the stored figure is the
body less *some* of its panes. #346870 has panes of 0.027097 (two) and
0.013674 (two); stored 0.300896 = frame 0.246702 + the two larger panes. So
the door leaf's glass is counted and the side or top lights' glass is not.
A rule that tries every subset of the panes would match by chance too often
to trust on four doors; they stay unexplained.

**What changes in a bill of quantities** (schependomlaan, sum of
`rowQuantities` per class, old code against new): IfcWindow 8.46 to 10.26
m3, IfcDoor 15.55 to 16.39 m3. Before, the BoQ trusted the stored figure on
the 77 and left out 2.64 m3 of glass, a quarter of the windows' volume.

## What this does not show

One model, one ArchiCAD release's library (the "18" parts). Whether other
ArchiCAD libraries or versions store frames the same way needs another
ArchiCAD export with windows; none of the other 12 models is one. A window
volume matters little to most estimates (windows are counted and measured by
area), but a stored figure a quarter short is wrong wherever it is summed,
for instance a material or embodied-carbon total by volume.
