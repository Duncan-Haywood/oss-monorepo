# Doors with side lights store the leaf's glass and not the side lights': 6 unexplained NetVolumes to 2, 2026-11-22

Follows [glazing-left-out-2026-11-21.md](glazing-left-out-2026-11-21.md),
which left 6 stored NetVolumes on the 13 public models with no named cause:
four schependomlaan doors of the ArchiCAD library part "D2R 2zl 18" (merk
E1-R and E5-R) and two zinc copings (IfcCovering "zinkwerk"). That note saw
that #346870 stores its frame plus its two larger panes, and declined a rule
that tries every subset of the panes, as one that would match by chance.

**Data.** The same 13 models: `opensourceBIM/IFC-files` at `cb96c50` (HHS
Office architect and construction) and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (this run's clone is at `d1962b4`; the 11 files gave
output identical to the 2026-11-21 run's, timings aside). Blob-less sparse
clones, not committed. Rerun: `node eval/stored-vs-computed.mjs <13 files>
--json eval/stored-vs-computed-2026-11-22-sidelights.json` (output in
`stored-vs-computed-2026-11-22-sidelights.txt`).

## The four doors

"2zl" is *twee zijlichten*, two side lights. Each door's body holds four or
six panes in two planes: the leaf glass 24 mm thick at y = 18 to 42 mm in the
door's frame, and the side lights at y = -28 to -4 mm, set in the fixed frame
either side (the outer 240 to 270 mm at each end of a 2,470 or 2,540 mm
door). The stored figure is the body less the side lights' glass, every time:

| Door | body m3 | leaf panes m3 | side lights m3 | body less side lights | stored |
|---|---:|---:|---:|---:|---:|
| #346870 E1-R | 0.328244 | 2 x 0.027097 | 2 x 0.013674 | 0.300896 | 0.300896 |
| #406457 E1-R | 0.335223 | 2 x 0.019500 + 2 x 0.004713 | 2 x 0.013674 | 0.307875 | 0.3079 |
| #968920 E5-R | 0.290780 | 2 x 0.023069 | 2 x 0.013722 | 0.263336 | 0.2633 |
| #971345 E5-R | 0.290780 | 2 x 0.023069 | 2 x 0.013252 | 0.264276 | 0.2643 |

(#406457's leaf glass is split by a transom into four panes; they are still
one plane.) The side lights differ between the two E5-R doors (0.013722 and
0.013252) and the stored figure follows them, as the window figures followed
their panes on 2026-11-21.

## The rule

`glazingLeftOut` (`qto.mjs`) now groups a window's or door's glass items by
plane: each pane's thinnest box axis in the body's frame and its span along
it, two panes in one plane when both faces sit within a tenth of the thinner
pane's thickness (`glassPlanes`; mapped panes are carried into the body's
frame through the mapping). After the whole-glass test, and only when the
body has two planes or more, it tries the body less each one plane's glass,
at the same quarter tolerance (0.5%). A hit is still `glazing-left-out`; the
check carries `glassLeftOut: {volume, pieces}` naming the plane's glass.

This is the narrow form of the subset rule the earlier note declined: a
door with *n* planes offers *n* alternatives, not 2^panes. On these four
doors two planes give two candidates each; the chance that a stored figure
lands within 0.5% of one of them by accident, when the true cause is
something else, is small, and every one of the four lands within 0.02%.

The planted test in `engine.test.mjs` covers a door with a leaf pane and a
side light in another plane (stored = body less the side light, named), a
door with two panes in one plane whose stored figure leaves out only one of
them (stays unexplained: not a plane), and the whole-glass rule still taking
precedence.

## Result

| NetVolume pairs (13 models) | 2026-11-21 | 2026-11-22 |
|---|---:|---:|
| pairs | 6,405 | 6,405 |
| agree | 6,172 | 6,172 |
| glazing-left-out | 77 | **81** |
| **unexplained** | **6** | **2** |

Old code against new on the same 13 files: the four doors are the only
lines that change (diff of the two outputs, timings aside). No GrossVolume
row moved. In the bill of quantities the four doors now sum their bodies
(1.245 m3) where they summed the stored 1.136 m3: before, an unexplained
figure kept the stored number.

## The two left: zinc copings

#740000 and #740117 are one extruded profile ("IFC_zinken_afdekker_laagbouw",
a 1 mm zinc coping: a 225 degree band between radii 19 and 20 mm, then a
polyline along the top and a folded drip) run 9.57 and 6.09 m. The file
stores `End Surface Area` 0.000821221593301 m2, exactly twice a 410.611 mm2
section, and both NetVolumes are that section times the length. The profile
as written encloses 396.336 mm2 (shoelace on a 4,000-segment arc; the engine
agrees), so ArchiCAD's section is 14.27 mm2 (3.6%) larger than the curve it
exported. Tried and ruled out: either arc taken the other way round (273.8,
1,530.5 or -860.3 mm2), the polyline as chords without the arcs (312.7), the
drip triangle dropped or doubled (404.5, 412.6), the polyline crossing itself
(it does not). The stored side areas (403.04 and 409.99 mm per metre run)
sum to 813.02 mm against the curve's 813.84 mm outline, so ArchiCAD measured
nearly the same outline but a larger area. Without a second ArchiCAD
profile export to compare, there is no rule here to name; both stay
unexplained, and the BoQ already sums the geometry for them.

## What this does not show

One model, one ArchiCAD library ("18" parts), four doors of one library
part. Whether other side-light doors (or other libraries) store the same
figure needs another ArchiCAD export with such doors.
