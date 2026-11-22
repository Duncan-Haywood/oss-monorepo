# Tekla's cut members' Length from their bodies (2026-11-22)

**Question.** The member Length from geometry (`eval/member-lengths-2026-11-22.md`)
held back every cut Tekla member: 176 on the three public Tekla exports. The
body's extent along the takeoff's axis matched Tekla's stored `Length` on 156
of 172 that passed the width test, and the note guessed Tekla's figure "may be
the part's reference-line length, which the IFC body does not carry". Is there
a reading of the body that matches Tekla often enough to offer, and can the
misses be told apart before writing anything?

## What the 16 misses were

Every cut Tekla member here is an `IfcFacetedBrep` (no extrusion, no `Axis`
representation), so the takeoff guesses the member's axis from its faces
(`prismAxis`, or with more than 48 faces the end normal along which it is
longest). Read one by one:

| Misses | Name | What the body is | Why the extent missed |
| ---: | --- | --- | --- |
| 9 | M3D-CON `DIA-2` (`250*1453`) | a 250 mm slab whose 12-sided outline is a diagonal brace 1,453 mm deep | the outline's two big faces lie along every direction in their plane, so the takeoff's axis came out 7 deg off the brace; along the brace the extent is 2.4766 m against 2.4767 m stored |
| 4 | M3D-CON-CD `BOTTOM_PART` | a 51 x 51 x 4.5 mm plate with a corner cut | not a linear member (stored 4.5 mm, the plate's thickness) |
| 3 | Mini Project `AFLOOP` (downpipes, `BUIS110/1`, `BUIS160/1`) | a tube with an offset bend | no straight length exists; volume over section is Tekla's figure on all three |

So Tekla's `Length` is the extent along the part's own axis, as the 156
suggested, and the body does carry that axis: it is the direction of the
member's long side faces. What failed was finding it.

## What changed

- `boxAxis(body, solidExtent)`: the smallest box around the body among the
  frames set by one of its six largest face directions and a second face
  normal turned square to it. A cut prism's box is flush with its side faces
  whatever its ends do. The longest side is the member's axis.
- `boxLength(row, solidExtent)`: the extent along that axis, offered when
  - the box is more than 5% longer than its next side (`BOTTOM_PART`'s box is
    51.4 x 51.4 x 4.5 mm: held back), and
  - the section through the box's middle spans at least 90% of both widths
    (`midSpan`: where the face edges cross the mid plane). A bent pipe's mid
    section covers half its box (`AFLOOP 110`: 0.48 of 0.231 m): held back.
- `LENGTH_CONVENTIONS` gives Tekla the new convention `box`; `memberLength`
  reads it. ARCHICAD keeps `centroid`; Revit and other tools still get none.
- The first version tried all pairs of face normals: 18 s on Mini Project and
  37 s on M3D-CON-CD. Limiting the first face to the six largest gives the
  same 147 lengths in 0.65 s and 1.0 s.
- A volume-over-section test for "straight" was tried first and dropped: it
  held back 76 correct lengths, on walls exported as beams with openings and
  `TT33` double tees, whose mid section is smaller than their average one.
- Tests: `geometry-quantities.test.mjs` (a diagonal brace outline against a
  wrong takeoff axis, a bent pipe and a base plate held back, a straight pipe
  with a 45 deg foot offered, the Tekla owner history choosing `box` while an
  unknown tool gets none).

## Setup

As in `eval/member-lengths-2026-11-22.md`: `opensourceBIM/IFC-files` at
`cb96c50` and `ThatOpen/engine_web-ifc` at `5ba2467`, `tests/ifcfiles/public/`.

```
node --max-old-space-size=7000 eval/member-lengths.mjs MODEL.ifc ... --json eval/tekla-cut-members-2026-11-22.json   # > tekla-cut-members-2026-11-22.txt
node --max-old-space-size=7000 eval/member-lengths-fill.mjs MODEL.ifc ... --out DIR                                  # > tekla-cut-members-fill-2026-11-22.txt
python3 eval/member_lengths_ifctester.py DIR     # IfcOpenShell 0.9.0.post1; > tekla-cut-members-ifctester-2026-11-22.txt
```

## 1. Against every stored Length, ten exports

Only the Tekla rows change (`eval/tekla-cut-members-2026-11-22.txt` against
`eval/member-lengths-2026-11-22.txt`):

| Model | Class | Offered before | Offered now | Within 2% | Cut, held back before | now |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Mini Project | IfcBeam | 1,101 | 1,129 | 1,129 | 37 | 9 |
| Mini Project | IfcColumn | 8 | 26 | 26 | 18 | 0 |
| M3D-CON-CD | IfcBeam | 18 | 106 | 106 | 104 | 16 |
| M3D-CON | IfcBeam | 12 | 25 | 25 | 13 | 0 |

- **147 more lengths offered, 147 within 2%**, all of them within 0.1% of
  the stored figure (the largest gap 0.075%, on M3D-CON).
- Over all ten exports: 4,056 offered, 3,374 within 2%; leaving out the 676
  ARK_NUS figures repeated on pieces of different length, **3,374 of 3,380
  (99.8%)**. The 6 other misses are the same ARCHICAD and Revit ones as before.
- Cut members held back: 176 to 29. They are the 7 bent downpipes, the 8
  `BOTTOM_PART` plates (4 beams, 4 columns on M3D-CON-CD), and 12 `DIA-P`
  slabs and 2 `PLOOIWERK_BAKGOOT` pieces whose middle section does not span
  their box. The box length would have been right on all 14 of those: the
  span test is conservative, and it is the price of keeping the downpipes out.

## 2. End to end: the fill with the stored lengths hidden

`eval/tekla-cut-members-fill-2026-11-22.txt`:

| Model | Written before | Written now | With a stored Length | Within 2% | Left to the table |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mini Project | 1,340 | 1,386 | 1,383 | 1,383 | 817 |
| M3D-CON-CD | 102 | 190 | 190 | 190 | 152 |
| M3D-CON | (not run) | 25 | 25 | 25 | 6 |

The HHS and schependomlaan lines are unchanged. The fill's own re-read passes
every written value, and **IfcTester agrees**: 1,386, 190 and 25 elements go
from fail to pass, the same counts as written
(`eval/tekla-cut-members-ifctester-2026-11-22.txt`).

## What this does not show

- Three Tekla exports, two of them versions of one project (M3D-CON and
  M3D-CON-CD). Another Tekla office's export, or a newer Tekla release, may
  write cut members differently.
- Tekla's figure for a bent part (a polybeam, a bent pipe): volume over
  section matched all 3 here, but 3 is too few to offer it; they stay in the
  to-fill table.
- Revit cut members: still no public model with one storing a Length.
