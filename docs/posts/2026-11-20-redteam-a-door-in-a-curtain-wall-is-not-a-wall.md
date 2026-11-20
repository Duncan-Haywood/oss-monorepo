---
title: "A door in a curtain wall was priced as wall: red-teaming the Uniformat rules"
seo_title: "IFC to Uniformat II red team: curtain-wall doors and roof coverings"
date: 2026-11-20
tags: [redteam, testing, ifc-quantity-takeoff, bim, uniformat]
description: "20 faults seeded in the IFC takeoff's Uniformat rules and engine, 9 caught; three wrong codes found and fixed, the 17-model eval unchanged."
---

The [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/) gained
Uniformat II grouping today: every element in the bill of quantities gets an
elemental code (B2010 Exterior Walls, C1020 Interior Doors and so on), from the
model's own Assembly Code where it has one and from rules on its class,
PredefinedType, IsExternal and the assembly it belongs to where it does not.
This red-team run seeded faults into that file and the takeoff engine beside it,
then read the rules looking for elements they would put in the wrong place.

## What the tests caught

| File | Seeded | Caught before | Caught after |
| --- | --- | --- | --- |
| `ifc-quantity-takeoff/uniformat.mjs` | 10 | 5 | 10 |
| `ifc-quantity-takeoff/qto.mjs` | 10 | 4 | 10 |

Each fault is one small change to one line (`===` to `!==`, `&&` to `||`, `+1` on
a constant), applied by `prompts/redteam.py`, which runs the venture's suite and
restores the file. Of the 11 that got through, every one was a real hole in the
tests, not dead code:

- The roofing, mullion, lift and paving rules had no test at all. A rule that
  sent every covering to B3010 Roof Coverings passed.
- A unit assignment holding a currency (`IFCMONETARYUNIT`, which most exports
  include) was never in a test, so a change that crashes on it passed.
- When two quantity sets on one wall both name `GrossVolume`, the first is meant
  to win. Nothing checked that.
- A wall whose opening cannot be read keeps its gross volume. A change that also
  threw away its gross areas passed, because no test had an unreadable opening.

Each now has a test that fails on the fault and passes without it.

## What reading the rules found

Three answers were wrong, each shown by a test that failed before the fix:

1. **A door that is part of a curtain wall took the curtain wall's code.** The
   rule "parts of a curtain wall are measured with it" is right for its panels
   and mullions, but a door that the model aggregates into a storefront came
   out as B2010 Exterior Walls. That held even when the door said
   `IsExternal = true`, and a door flagged interior went to the exterior wall
   line too. A door now stays a door: B2030 or C1020 by its own flag, else by
   the curtain wall's.
2. **A roof's covering became roof construction.** A `ROOFING` covering
   aggregated into an `IfcRoof` came out B1020 (Roof Construction) instead of
   B3010 (Roof Coverings), and a floor finish aggregated into a stair came out
   C2010 (Stair Construction) instead of C2020 (Stair Finishes). Coverings now
   keep their own element. In a roof, anything but a ceiling is a roof
   covering, since NISTIR 6389 puts roof insulation and membranes there too.
3. **A malformed code was read as a shorter one.** An Assembly Code of `B201`
   was read as `B20` Exterior Enclosure. The code reader now accepts two or four
   digits after the letter, and nothing in between.

## What it does not change

The published check of the rules on
[17 public models](/posts/2026-11-20-every-window-flagged-interior-uniformat-from-ifc/)
was rerun with the old and new code. The output is byte-identical: none of those
models aggregates a door or a covering into another element, or writes a
three-digit code. So the fixes reach models outside that set, and the 482 of 588
agreement with authors' codes stands as published. A test set with storefront
doors would show how often this happens in practice. We have not measured that.

The guards are in `uniformat.test.mjs` and `engine.test.mjs`. The run record,
with every fault and its triage, is
`prompts/runs/2026-11-20-session_01E5sJKnaXpXJjKrCHR69EuH.json`.
