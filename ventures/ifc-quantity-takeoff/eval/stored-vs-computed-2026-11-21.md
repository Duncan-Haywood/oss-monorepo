# The unexplained GrossVolumes: 159 to 34, 2026-11-21

Follows [stored-vs-computed-2026-11-19.md](stored-vs-computed-2026-11-19.md)
and its 2026-11-20 rerun ([faceted-causes-2026-11-20.md](faceted-causes-2026-11-20.md)),
which left 159 stored GrossVolumes that disagreed with the geometry with no
named cause. Question: what are they, and which of them make a bill of
quantities wrong?

**Data.** The same 13 public models at the same commits
(`opensourceBIM/IFC-files` `cb96c50`, HHS Office architect and construction;
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`), fetched with blob-less
sparse clones, not committed.

**Method.** Each unexplained row was printed beside the element's other
stored figures (NetVolume, GrossSideArea and NetSideArea, GrossArea and
NetArea, Width). Two patterns covered almost all of them; each was read on
many elements before it became a rule in `explainChecks` (`qto.mjs`, the code
the page runs). Rerun: `node eval/stored-vs-computed.mjs <13 files> --json
eval/stored-vs-computed-2026-11-21.json` (output in
`stored-vs-computed-2026-11-21.txt`).

## 1. Geometry exported with its openings already cut (105, schependomlaan)

All 91 walls and 14 slabs of schependomlaan (ArchiCAD, faceted breps) that
were unexplained have the same shape:

- the computed volume equals the element's own stored **NetVolume** (wall
  #27645: computed 1.3573, stored NetVolume 1.3573, stored GrossVolume 1.8219);
- the file has no `IfcOpeningElement` voiding the element: the windows' holes
  are in the brep itself;
- the gap is the stored opening area times the thickness, from the
  exporter's own figures: (GrossSideArea - NetSideArea) x Width =
  (8.5133 - 6.3424) x 0.214 = 0.4646 = 1.8219 - 1.3573. On slabs,
  (GrossArea - NetArea) x depth gives the gap the same way (#43828, a ground
  floor pour: 33.17 m3 of 42.59 stored is openings).

That second check agreed on 104 of the 105 to 0.0001 m3 (the printed
rounding), and on the last, #682613, to 0.9% (gap 2.4113 against 2.4330 from
the stored areas); the rule itself
needs only the first two (no openings in the file, computed = stored net,
stored gross more than 2% above it), so it also fits exporters that store no
side areas. Reason `body-is-net`. Here the **stored gross is the right
gross** and the geometry is the net, so the BoQ, which sums the stored
NetVolume, was already right; what changes is that 105 rows a user would
have had to check by hand are explained.

## 2. Litres over the square-foot factor (20, skolebygg)

22 skolebygg slabs (Revit, `Basic Roof:Tak beton`, `Tak tre 2`,
`Floor:Betongdekke`) stored GrossVolumes 92.9 times their geometry:

| Slab | Computed m3 | Stored | Ratio |
|---|---:|---:|---:|
| #67904 | 225.0918 | 20,911.71 | 92.90304 |
| #993822 | 204.9526 | 19,040.72 | 92.90304 |
| #1393985 | 5.5945 | 519.75 | 92.90383 |

92.903 = 1000 / 10.7639: the litre slip the same model makes on 96 other
slabs (x 1000), divided by the m2-to-ft2 factor that kleine_Wohnung's roofs
carry. 20 of the 22 sit on it within 0.001%; the other two (#1186582 at
1,061.6, #1483037 at 1,034.2) do not and stay unexplained.

A compound factor (10^k x 10.7639 or its inverse) was kept out of
`unitSlip` on purpose: with 36 candidate factors at a 0.5% tolerance, about
one random ratio in a hundred would match one. So it is a second pass
(`compoundSlips`), run only on rows still unexplained, and a factor counts
only when at least three elements of the model share it to 0.5%: a
systematic exporter habit, not a coincidence. Two alone stay unexplained
(tested).

**This one changes the bill of quantities.** These slabs store no
NetVolume, so the BoQ summed their stored GrossVolume. Before, skolebygg's
slabs came to **134,776 m3**; now 11,086 m3, because the 20 slabs count their
geometry (1,346 m3) instead of 125,036 m3 of stored figure. A concrete
estimate off by a factor of twelve, on a model that looks normal in a viewer.

## Result

| | 2026-11-20 | 2026-11-21 |
|---|---:|---:|
| GrossVolume pairs | 5,495 | 5,495 |
| agree | 4,863 | 4,863 |
| net-as-gross | 327 | 327 |
| unit-slip | 99 | **119** |
| body-is-net | - | **105** |
| split / repeated | 27 | 27 |
| own-dimensions | 20 | 20 |
| **unexplained** | **159** | **34** |

NetVolume: 6,172 of 6,405 agree, unchanged by this work (kleine_Wohnung's
NetVolume pairs went from 226 to 265 between the two runs, from the curved
brep work on main, not from this). No row moved anywhere else on the 13
models; the area check is untouched.

## The 34 left

- Mini Project (Tekla): 22 accessories 2-3% off, Tekla's own faceted
  approximation of round parts (2026-11-19 report: the computed figure is the
  exact one).
- kleine_Wohnung: 7 walls whose openings are advanced breps; their net
  cannot be computed here, so neither rule can be tested on them.
- skolebygg: the 2 slabs above, 1 wall 2% off.
- HHS construction: 2 walls storing about twice their body (5.25 against
  2.66; 16.84 against 8.26), not exactly twice and with no second piece of
  the same Tag in the file.

## What this does not show

Both causes come from one model each (schependomlaan, skolebygg), so they are
two exporters' habits named, not shown general. The three-element floor for a
compound factor is a judgment, not a measured false-positive rate. NetVolume
still has 233 unexplained (schependomlaan's 69 windows and 18 doors computed
about 40% over the stored, Tekla's 120 parts), not looked at here.
