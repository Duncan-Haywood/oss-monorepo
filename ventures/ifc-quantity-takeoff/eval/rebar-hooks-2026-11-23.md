# Hooks in the bar schedule, 2026-11-23

**Question.** The bar schedule (`rebar.mjs`, [rebar-schedule-2026-11-22.md](rebar-schedule-2026-11-22.md))
measured every leg out to out, the BS 8666 way. Three of 33 leg dimensions
missed the authors' own figures, all of them hooks. Which end of a bar is a
hook, what is the straight tail a bending machine is set to, and do the
files' own hook figures agree with the drawn bars?

**Data.** Four public exports, downloaded to a scratch folder and not
committed (their licences vary): the three Tekla Structures 2025 files in
agustdiez/tekla-structures-hyt (`docs/ref/Ejemplo Hormigon/areas/`: the
chromatograph base and the fire wall from the 11-22 run, and the TR-12 base,
new here) and the Revit file JakkeLab/Study_IFCjs
`test-ifc-files-main/Structures/simple rebar.ifc`. Rerun:
`node eval/rebar-schedule.mjs <files>`; raw output:
[rebar-hooks-2026-11-23.txt](rebar-hooks-2026-11-23.txt).

## What was added

- **Hooks by geometry** (`barShape(...).hooks`): an end bend past 90 degrees
  whose end leg is at most half the leg on the bend's other side. A 180
  degree hairpin with two near-equal legs is not a hook; a 90 degree bend is
  a leg unless the file says otherwise. The tail is the straight run past
  the bend.
- **Hooks the file names** (`readBarProps`): Tekla's `HOOK_START_ANGLE` and
  `HOOK_END_ANGLE` (labels, `-90.000` for a hook turned the other way) and the
  ISO/BS/DIN bending sets' `...BendingStartHook` / `...BendingEndHook` (plane
  angles; a figure of 2 pi or less is read as radians). These name 90 degree
  hooks too, which geometry alone cannot tell from a leg.
- **Either way round** (`barHooks`): a file's start is not always the drawn
  path's start. Tekla lists L-bar mark 21's long leg first (A = 4,650,
  B = 190) and draws the 190 mm leg first. So the file's two angles are
  matched to the drawn ends the way whose angles agree, else the way whose
  named hooks are the shorter legs, and reported in the drawn order (the
  order of the leg dimensions).
- **Schedule and CSV**: start and end hook angle and tail columns; the page
  shows each hook under the shape. A note when the file names a hook angle
  the bar is not drawn with, or a hook on an end drawn straight.
- **ACI 318's minimum tail** (`minHookTail`): the larger of 4d and 65 mm
  past a 180 degree hook, 6d past a 135 degree stirrup or tie hook. A
  shorter tail is noted with the standard named. Ninety degree hooks are not
  checked, because their minimum depends on the bar's use (12d to develop a
  bar, 6d on a small stirrup), which the file does not say.

## Against the files

| Figure | Agree |
|---|---|
| Hook angle the file names, against the end bend drawn there (within 3 degrees) | **45 of 45** |
| before matching either way round | 42 of 45 |

The three that missed before the either-way match were all Tekla bars whose
named start was the drawn end: L mark 21, mark 23 (file's 90 degrees at the
end, drawn 12 degrees there and 90 at the start), and the rib stirrup
V2 / 21 (file 135 then 90, drawn 90 then 135).

**Tails.** Every 135 and 180 degree hook in the four files has a 48 mm tail:
6d on the 8 mm stirrups (Tekla F203_2, Tekla's rib stirrup, Revit's
Stirrup - T1) and 4d on Revit's 12 mm Rebar Shape 4. The 180 degree one is
under ACI 318's 65 mm and is noted. Tekla's 90 degree hooks on U-bars have
tails from 250 mm down to **7 mm** (mark 41: a 65 mm leg out to out over a
58 mm bend allowance). The schedule now shows that; whether a bending shop
can hold a 7 mm end is not checked.

## The hook dimensions that still miss, explained further

- **Tekla F203_2, E = 64 mm.** The 11-22 write-up called E "the straight
  part beyond the bend". It is not: the drawn tail is 48.0 mm (and 88.3 mm
  out to out). E is the figure Tekla's DIM_L sums, though: A 250 + B 530 +
  C 250 + D 530 + 2 x E 64 = 1,688, rounded down to 10 mm = 1,680, Tekla's
  DIM_L exactly. So E is Tekla's own hook dimension. 64 mm is 8d, and 48 mm
  plus 2d, plus half the 32 mm inside radius, or plus (r + d/2) tan 22.5
  degrees (64.6 to 64.8 mm). One bar can't separate those rules. A second
  Tekla 135 degree hook with another size or radius would.
- **Tekla measures out to out over the drawn size.** F203_2's A and B are
  250 and 530 against 249.4 and 529.4 here. The 0.6 mm is 2 x (8.625 - 8)/2,
  the ribs Tekla draws. The schedule keeps the nominal size, which is how
  BS 8666 schedules.
- **Revit's A = 114.3 mm** on both hooked shapes. That's 4.5 inches, on an
  8 mm stirrup's 135 degree hook and on a 12 mm bar's 180 degree hook. Both
  are drawn with 48 mm tails and different bends (29 and 46 mm centreline
  radius). The parameter does not follow the drawn hook. The file's hook
  angles (135/135, 180/90) do, and those agree.

Leg dimensions within 2 mm stay at 34 of 37 on these four files. The three
misses are the hook figures above. The hook columns don't change the leg
dimensions.

## Not done

- Tekla's E rule from a second 135 degree hook of another size or radius.
- Tekla's HOOK_START_LENGTH / HOOK_END_LENGTH are empty on every bar here.
  When a file fills them, compare them with the tail.
- A minimum end projection for 90 degree hooks and legs (the 7 mm end), and
  BS 8666 shape codes for hooked shapes (links with 135 degree hooks).
