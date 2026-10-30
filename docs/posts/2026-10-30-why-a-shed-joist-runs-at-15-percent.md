---
title: "Why a shed's floor joist runs at 15% of its strength"
date: 2026-10-30
tags: [shed-designer, framing, structure]
description: "Two hand calculations behind the shed designer's 15% readings, what actually sets each member's size, and a new view that colours every member by how much of its capacity it uses."
---

A builder and a homeowner walked through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) for an 8x12 shed they plan to build. The Structure tab showed most members at about 15% of capacity and the ridge beam at 79%. Their reading was that the shed is overbuilt: it is framed like a house, to house habits, when a shed this small is exempt from most of that code.

Before changing any sizes, we checked whether the 15% is real. Then we checked what is actually holding each member at its size.

**The floor joist, by hand.** The default 8x12 sits on three skids, at 1-3/4", 48" and 94-1/4" across the floor. Between the 3-1/2" skids that leaves 42-3/4" clear, and the check adds one bearing length, so the span is 46.25". The floor load is 10 psf dead plus 40 psf live. On a 16" strip that is 5.56 lb per inch of joist. The bending moment wL²/8 is 1,485 lb·in. A 2x6 (1-1/2" x 5-1/2") has a section modulus of 7.56 in³, so the bending stress is 196 psi. The allowable for SPF No. 2 is 875 psi × 1.3 for a 2x6's size × 1.15 for joists sharing load, which is 1,308 psi. 196 / 1,308 = **15.0%**, the tool's figure exactly.

The joist is short and lightly loaded, so nothing else comes close: shear is at 13%, and the sag under live load is 0.009" against an allowance of 0.128". The tool now tries the next lighter floor and builds it. 2x4 joists at 16" would run at 32%, and 2x4s at 24" at 48%. Both pass every load and connection check. So the floor joists really are oversized, and the 15% is the honest measure of it.

**The wall stud, by hand.** A 2x4 stud in the eave wall carries the bottom half of each rafter, the wall's own width and the 6" overhang: 31" of roof at 4/12. That is 40.8 lb/ft of dead load and 77.5 lb/ft of snow. Under dead load plus snow, the stud is at under 5%. The case that governs is dead load plus 0.6 × the 20 psf wind pressure on the siding. That puts 12 psf on a 16" strip of an 82" stud and bends it to 366 psi, against an allowable of 2,415 psi for wind-duration loads. NDS's combined bending and compression formula gives **15.4%**, again the tool's figure. With the wind set to zero the stud drops to 7%, and with no snow it stays at 15.4%. The wall is sized by wind on its face, not by the roof.

The stud is also as small as studs come, and it cannot go to 24" spacing either: T1-11 panels are rated for studs at 16". So the stud's 15% is not house habit. The siding sets its spacing, and its size is the minimum on the menu.

**What holds each member where it is.** The new margin report goes through every member below half of a target you set (70% by default). For each one it builds the lighter versions the tool can frame, runs them through every load and connection check, and names the reason the member is at its size. On the default 8x12 the results are:

| Member | Use | What the tool found |
|---|---|---|
| Ridge beam, 2-ply 2x10 | 79% | Above a 70% target. A 2-ply 2x8 would fail at 118%, and a 2x12 would bring it to 59%. |
| Ridge-beam posts, 2-ply 2x4 | 25% | The minimum practical size: two plies are what give the two-ply beam full bearing. |
| Rafters, 2x6 at 24" | 18% | Simply oversized: 2x4 rafters would pass at 39%. |
| Wall studs, 2x4 at 16" | 15% | Held by the siding's rating (T1-11 at 16"). LP's 7/16" panel allows 24", where the stud is at 23%. |
| Floor joists, 2x6 at 16" | 15% | Simply oversized: 2x4s at 16" would pass at 32%. |
| Headers, 2-ply 2x6 | 4-12% | 2-ply 2x6 is the smallest header the tool frames. A flat or single header is not modelled yet. |

The pattern holds across the presets. In each design one member does real work and the rest is set by minimums. Under a ridge beam that member is the beam. Under a ridge board it is the nailing at the heel joint, where the rafter tie holds the rafters' outward thrust: 70% on the 8x8, 85% to 97% on the larger presets.

**Seeing it.** The Structure tab now lists every member, most used first. Opening one writes out its check: the inputs, each formula, and the numbers from the moment to the allowable stress. A switch on the 3D view colours the framing by use, from blue under 25% through to red over capacity, with members that are not checked on their own in grey. Tapping a member names it and opens its check. The floor, roof and wall framing plans come in the same colours, so the slack is plain to see.

The breakdown is built separately from the Structure check, then compared with it. If the two ever disagree, the tool shows only the Structure tab's result and says so. A test sweeps more than a thousand variations of roof, size, spacing, load and opening to keep them in step.

These are screening checks on SPF No. 2 by allowable stress, the kind a span table encodes. They are not an engineer's review, and the plans are not engineered or code-checked.
