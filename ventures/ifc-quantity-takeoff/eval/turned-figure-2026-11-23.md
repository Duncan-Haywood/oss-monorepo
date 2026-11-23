# IfcOpenShell's turned figure in the brep comparison, 2026-11-23

**Question.** [pole-faces-2026-11-22.md](pole-faces-2026-11-22.md) found that
the five curved breps disagreeing with IfcOpenShell "for no named cause" were
IfcOpenShell meshes with faces turned inside out, using a separate script on
hand-picked ids. Can the reference script check every brep's mesh for this,
so the comparison names the cause itself, and what does it explain across
both models?

**Data.** `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`
(ISSUE_159_kleine_Wohnung_R22.ifc, FM_ARC_DigitalHub.ifc; blob-less sparse
clone). IfcOpenShell 0.9.0.post1 (pip), 0.05 mm / 0.02 rad.
The reference files written are committed next to this note
(`kleine_Wohnung-breps-ifcopenshell-2026-11-23.json`,
`FM_ARC_DigitalHub-breps-ifcopenshell-2026-11-23.json`), so a later run can
compare without the 23 minutes of meshing. Full output:
[turned-figure-2026-11-23.txt](turned-figure-2026-11-23.txt).

## What changed

- `eval/ifcopenshell-volumes.py --breps` checks each brep's mesh (`turned()`):
  vertices welded, directed edges counted. A mesh whose every directed edge
  pairs with its reverse is written as before, a plain volume. One that does
  not is written as `{volume, turned, unpaired, pieces}`: `turned` is what the
  same triangles enclose once each is turned to agree with its neighbours
  (breadth-first over shared edges), each connected piece counted right way
  out. The welding and the edge counts are numpy; the breadth-first pass runs
  only on meshes that need it. Checked on a hand-made cube: whole, it is a
  plain volume; with its top turned, 4 unpaired edges and 1.0; with a second
  cube wholly inside out beside it, 2 pieces and 2.0.
- `eval/breps-vs-ifcopenshell.mjs` reads either form. A new reason,
  `ifcopenshell-turned`, comes after `ifcopenshell-over-box` and
  `overlapping-pieces`. It is tested after the overlapping pieces on purpose:
  the turned figure also sums each piece right way out, so on a shell whose
  pieces overlap it agrees with this tool's sum without explaining it. A
  first ordering (turned before pieces) moved 17 kleine_Wohnung breps into
  `ifcopenshell-turned`, among them #12489 at 0.328 m3 in a 0.254 m3 box,
  which no single solid can be. A summary line then counts, under whatever
  reason came first, how many disagreements the turned figure matches.

## Results

| | kleine_Wohnung | FM_ARC_DigitalHub |
|---|---:|---:|
| Advanced breps / read / agree within 0.1% | 775 / 775 / 708 | 1314 / 1309 / 1267 |
| Meshes with unpaired directed edges | 66 | 42 |
| Unexplained, volumes only (as before) | 3 | 12 |
| Unexplained, with the turned figure | 1 | 4 |
| `ifcopenshell-turned` | 2 | 8 |
| Over-box figures the turned mesh matches within 0.5% | 34 of 35 | 21 of 21 |
| Overlapping-piece shells it matches (both sum the pieces) | 17 of 27 | 9 of 9 |

Unexplained disagreements: 15 to 5. The ten newly named are the five of
2026-11-22 (#162827, #207801, #121421, #128967, #130735) and five more on
FM_ARC_DigitalHub (#123495 and #133795, 0.0246 m3 raw against 0.00404
here and 0.00404 turned; #126660 and #129298; #134348, 0.12% apart raw).

The five left all have every directed edge paired, so they are not this:
kleine_Wohnung #207997 (ruled B-spline, 0.21% light here), FM_ARC_DigitalHub
#127419/#128178 (B-spline, 0.17% light) and #123731/#134031 (surface of
revolution, 0.29% light). Each is light by an inscribed mesh's 0.02-0.3%,
so they are tessellation gaps of this tool's mesh against IfcOpenShell's finer
one, past the 0.1% agreement line.

**The over-box figures are the same fault.** `ifcopenshell-over-box` was
named for IfcOpenShell volumes larger than the brep's bounding box, which no
solid can have. 55 of those 56, turned, enclose this tool's volume within
0.5% (most to 5 significant figures: kleine_Wohnung #11525 0.43922 m3 raw,
0.014616 turned, 0.014616 here). So on these two models the over-box
figures, too, come from IfcOpenShell meshes with faces turned the wrong way.
The one that does not match is kleine_Wohnung #172368, a small cylinder-and-plane brep where all three figures are over its 1.48e-6 m3 box (here 3.04e-6, IfcOpenShell 1.64e-6, turned 2.29e-6): neither side reads it as one closed solid, and it is left with the not-closed pair (#160849, #172538) to look at on the model. The
reason keeps its name (it needs no reference mesh to prove), and the
summary line now says what lies under it.

**What is not settled.** For shells in overlapping pieces, the turned
figure agrees with this tool's sum, which counts each overlap once per piece.
The union these lumps stand for is still not computed by either side
(NEXT.md, "overlapping shell pieces as a union").

## Tests

No venture code changed: `engine.test.mjs`, `surface.test.mjs` and the rest
run as before (`python3 platform/ci/run_venture_tests.py ifc-quantity-takeoff`).
The scripts are eval tools; the cube check above is the test of `turned()`.
