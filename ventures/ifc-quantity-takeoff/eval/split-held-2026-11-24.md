# The last figures in doubt: walls split at a level, and a plate's whole skin, 2026-11-24

**Question.** [in-doubt-2026-11-23.md](in-doubt-2026-11-23.md) left 3
volumes and 13 areas, over 15 public models, that the bill of quantities sums
although they disagree with the geometry for no named cause. Two groups were
the largest: HHS construction's walls #1405 and #4407 (stored about twice
the body, 11.18 m3) and M3D-CON-CD's 7 Tekla plates (stored area 2 to 3 times
the plan cut, 32.6 m2, 6.6% of that model's BoQ area). What are they?

**Data.** The same 15 models: `opensourceBIM/IFC-files` "HHS Office"
architect and construction, and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (13 files), blob-less sparse clones, not committed.

**Method.** Each element's stored quantities, body and face areas printed
from `takeoff()`, then the STEP lines read by hand. Every row whose named
cause changed between `main` and this change, with each model's BoQ totals
before and after:
[split-held-whole-surface-reasons-2026-11-24.txt](split-held-whole-surface-reasons-2026-11-24.txt).
The doubt sweep rerun: `node eval/in-doubt.mjs <files>`
([in-doubt-2026-11-24.txt](in-doubt-2026-11-24.txt)).

## The two HHS walls are half a wall each

Each wall's Tag is shared with an `IfcWall` that stores no quantities at
all, stacked directly on or under it (the same plan box, the next level):

| holder | stored GrossVolume | its body | the other piece | its body | sum | stored GrossSideArea | sum of side areas |
|---|---:|---:|---|---:|---:|---:|---:|
| #1405 `IfcWallStandardCase`, z 0.09-3.80 | 5.2520 | 2.6565 | #1493 `IfcWall`, z 3.80-7.30 | 2.5955 | 5.2520 | 26.7572 | 26.7572 |
| #4407 `IfcWallStandardCase`, z 7.30-10.90 | 16.8414 | 8.2591 | #4355 `IfcWall`, z 3.80-7.30 | 8.5823 | 16.8414 | 56.729 | 56.729 |

Revit splits a wall at a level and writes the whole wall's quantities on
one piece, as the `split` rule already knew, but that rule wants every piece
to carry the same stored figure. Here the other piece stores none, and it is
exported as the other class (`IfcWall` beside `IfcWallStandardCase`). The
sums agree to four decimals.

`explainChecks` and `explainAreas` now name this `split-held` (`heldSplit`
in `qto.mjs`): the other rows with the element's Tag, of the same kind of
element (the class with `StandardCase` or `ElementedCase` dropped), store
nothing for that figure, and their bodies plus its own sum to the stored
figure within 0.5%. The BoQ then sums each piece's own geometry.

The rule also reached four more walls of the same model, #656, #871, #1555
and #3992. Their volumes were already summed from geometry (named
`own-dimensions`), so the volume total did not move for them. But their
`GrossSideArea` had been accepted (`matches-stored-volume`: stored area x
width = stored volume, which is true of the whole wall) and summed as
stored, while the upper pieces' areas were summed from their geometry as
well. **HHS construction's BoQ counted 129.17 m2 of wall twice: 7,751.64 m2
before, 7,622.47 after (1.7%), and 11.18 m3 of concrete (2,368.97 to
2,357.79 m3).** Nothing showed that before, because the area had a named,
trusted cause.

## The Tekla plates store their whole skin

Each plate's `NetArea` is the sum of the areas of every face of its body,
to 1e-6 or better:

| plate | stored NetArea m2 | sum of all faces m2 | plan cut m2 |
|---|---:|---:|---:|
| #30876, #37016 "JD-1" (PL1110*119) | 28.2990 | 28.2990 | 12.879 |
| #494081, #494429 "PLATE" | 0.7440 | 0.7440 | 0.360 |
| #494234, #494415 "Base Plate" | 0.4917 | 0.4917 | 0.237 |
| #494386 "Base Plate" | 0.6379 | 0.6379 | 0.194 |

So it is not a plan area at all but the surface a painter or galvaniser
prices: both faces and every edge. `explainAreas` names it `whole-surface`:
a stored plan area within 0.5% of the sum of the body's plane areas (at
least three planes). The BoQ's area column then sums the plan, like every
other plate's. M3D-CON-CD's BoQ area goes from 491.54 to 458.98 m2.

The same plates' `GrossArea` (1.3858 m2 on "JD-1", 0.3046 on the base
plates) still disagrees for no named cause. It is not what the BoQ sums
(NetArea comes first), so it is not in doubt there. On the square plates it
is the stored Width squared (0.5519² = 0.3046; 0.6² = 0.36), which suggests a
bounding rectangle before cuts, but "JD-1" does not fit that reading and it
is not named.

## What is left in doubt

| | before (2026-11-23) | after |
|---|---:|---:|
| volumes in doubt, 15 models | 3 | 1 |
| areas in doubt | 13 | 6 |
| models with nothing in doubt | 11 of 15 | 13 of 15 |

The rest: ARK_NUS #1167770 (2.1%, just past the tolerance) and three of its
walls' areas, and schependomlaan's three zinc copings, all in
[curved-and-faces-2026-11-22.md](curved-and-faces-2026-11-22.md), "The 14 left".
Every other row's named cause is unchanged on all 15 models (the reasons file
lists the 17 rows that changed, and no others).

## What this does not show

- That Revit always exports split walls this way: six walls of one model are
  all that has been seen. The 0.5% window was set by hand; the sums seen
  agree to 1e-4.
- That Tekla writes every plate's NetArea as its skin. Seven plates of one
  model do; a plate whose stored area is its plan still agrees and is never
  tested.
- Whether an estimator wants the skin area too. It is a real quantity for
  coatings; the takeoff keeps it (`areaCheck.NetArea.surface`) but no BoQ
  column sums it yet.
