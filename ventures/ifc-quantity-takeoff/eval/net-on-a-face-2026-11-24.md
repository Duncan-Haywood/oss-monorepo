# Three Revit walls store one face net of its openings, 2026-11-24

**Question.** [split-held-2026-11-24.md](split-held-2026-11-24.md) left 1
volume and 6 areas in doubt over 15 public models: figures the bill of
quantities sums although they disagree with the geometry for no named cause.
Four are ARK_NUS skolebygg's (`ThatOpen/engine_web-ifc`,
`tests/ifcfiles/public/ISSUE_068_ARK_NUS_skolebygg.ifc`, a Revit export):
three walls' `GrossSideArea` (2.4%, 6.4% and 49.7% off) and one wall's
`GrossVolume` (2.0%). What are they?

**Data.** The same 15 models as before (HHS Office architect and
construction from `opensourceBIM/IFC-files`, 13 from
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`), blob-less sparse clones,
not committed.

**Method.** Each wall's stored quantities, body, openings and per-face side
areas printed from `takeoff()`, and its STEP lines read by hand. Then every
row's named cause, and each model's BoQ totals, compared between `main` and
this change ([net-on-a-face-reasons-2026-11-24.txt](net-on-a-face-reasons-2026-11-24.txt)),
and the doubt sweep rerun: `node eval/in-doubt.mjs <files>`
([in-doubt-2026-11-24b.txt](in-doubt-2026-11-24b.txt)).

## The three areas: one face, openings out

The engine measures a wall's side area on its middle plane and on each of
its two faces, gross and net of its openings. The stored `GrossSideArea` of
each of the three walls is one face's *net* area, to 1e-6:

| wall | openings | stored GrossSideArea m2 | middle plane, gross | face 1 gross / net | face 2 gross / net |
|---|---:|---:|---:|---:|---:|
| #556796 IVA 3.2 145mm | 1 | 3.747429 | 3.659 | 3.659 / 3.337 | 4.069 / **3.747429** |
| #1280178 IVA 4.3 172mm | 1 | 15.087303 | 16.052 | 17.208 / **15.087303** | 16.052 / 13.931 |
| #1483180 IVA 2.3T 134mm | 3 | 9.627227 | 14.407 | 14.407 / 9.304 | 14.730 / **9.627227** |

In each case it is the longer face (a corner join makes the faces differ in
length). The engine already named two neighbours of this cause: `net-as-gross`
(the stored gross is the middle plane net of openings) and `on-a-face` (the
stored figure is one face, gross). Neither fits alone: Revit takes the face
*and* takes the openings out. The same three walls' `GrossVolume` is already
named `net-as-gross`, so the quantity set is consistent: Revit's "gross" is
net in both.

`explainAreas` now names it `net-on-a-face`: a wall's stored gross side area
equals one face's net area within 0.5%, and the wall has an opening. Like
`net-as-gross`, it is a named cause, not a reason to distrust the figure: the
BoQ still sums the stored area (it is a real, measured face), but it no longer
counts as in doubt. The BoQ totals do not move; what changes is that the
line no longer warns about these three.

## The volume: left in doubt

ARK_NUS #1167770 (IVA 4.3 172mm, Plan 02, no openings) stores 0.47048 m3
against a body of 0.46089 m3 (2.04%), and its `GrossSideArea` 2.735 m2
against 2.680 m2 by the same factor, so stored area x width = stored volume
(`matches-stored-volume`) and the quantity set describes a wall 0.674 m long
where the body is 0.660 m. The axis runs 0.796 m (the stored `Length`) from
the middle of the 272 mm wall #448363 it joins; the body starts 136 mm in, at
that wall's face. Neither 0.796 nor 0.660 gives the stored figure, and no
neighbouring wall, slab or door accounts for the 13.7 mm.

It is not out of family for this model: nine other walls of ARK_NUS with no
openings disagree with their bodies by 0.6% to 1.9% (all within the 2%
tolerance, so agreeing), the body larger in each. This one is 2.04% the
other way. Revit's join clean-up changes the volume it reports without
changing the swept body it exports; that is a plausible reading, not a shown
one, so the row stays `unexplained`, in doubt, and the BoQ line says so.

## What is left in doubt

| | before (2026-11-24, split-held) | after |
|---|---:|---:|
| volumes in doubt, 15 models | 1 | 1 |
| areas in doubt | 6 | 3 |
| models with nothing in doubt | 13 of 15 | 13 of 15 |

The rest: ARK_NUS #1167770's volume (above) and schependomlaan's three zinc
copings, whose bodies are CSG differences the face reader cannot take a face
off ([curved-and-faces-2026-11-22.md](curved-and-faces-2026-11-22.md), "The
14 left").

## What this does not show

- That Revit always writes a holed wall's `GrossSideArea` this way. Three
  walls of one model do. HHS's and the other Revit models' holed walls
  already agree or carry another named cause, so they do not test it.
- Which face Revit picks. In all three it is the longer; with three cases,
  "longer" and "exterior" and "the face the location line is on" cannot be
  told apart, so the rule accepts either face.
