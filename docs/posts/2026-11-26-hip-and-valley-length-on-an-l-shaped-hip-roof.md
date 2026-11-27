---
title: "How long are the hips and valleys on an L-shaped hip roof?"
date: 2026-11-26
updated: 2026-11-27
tags: [wall-framing-takeoff, for-customers, construction]
description: Hip, valley and ridge lengths for an L-shaped hip roof, and its sheathing by hand, with hip cut-offs reused at valleys and at the next course's hip.
---

If you order hip and ridge cap, valley flashing or hip rafters off a plan, you need three numbers: the ridge length, the hip length along the slope and the valley length along the slope. On a rectangle there are textbook formulas. On an L, a T or a stepped plan, most people sketch the roof by hand. This post works one L-shaped house through by hand, gives the multipliers so you can check your own, and says what the framing takeoff we are building now does with any square-cornered outline.

## The one multiplier you need

On a hip roof where every plane has the same pitch, every hip and every valley runs at 45 degrees in plan. So measure its **run** along one wall direction (how far it travels in x, or in y, which is the same distance), then multiply:

| Pitch | Hip or valley length per foot of run | Common rafter per foot of run |
| --- | --- | --- |
| 4 in 12 | 1.453 | 1.054 |
| 6 in 12 | 1.500 | 1.118 |
| 8 in 12 | 1.564 | 1.202 |
| 12 in 12 | 1.732 | 1.414 |

The hip factor is √(2 + (pitch/12)²): √2 for the 45-degree diagonal in plan, plus the rise. The common factor is √(1 + (pitch/12)²), and roof area is plan area times that factor.

## A worked L-shaped house

The walls are a 40 × 40 ft square with a 16 × 16 ft corner cut out, so each leg of the L is 24 ft wide. The eaves overhang 12 in all round, so the eave line is a 42 × 42 ft L with 26 ft wide legs. All of the lengths below are measured to the eave line.

- **Hips.** The L has five outside corners. From each one, a hip runs up at 45 degrees until it meets the hip from the next corner or a ridge. Each leg is 26 ft wide at the eaves, so every hip covers half of that: **13 ft of run**.
- **Valley.** The one inside corner sends a valley up at 45 degrees toward the middle of the roof. It also covers **13 ft of run**, ending where the two ridges meet.
- **Ridges.** Each leg's ridge runs down the middle of the leg, from that meeting point to where the leg's end hips meet: 28 − 12 = **16 ft each**, 32 ft in all. Ridges are level, so no multiplier applies.

At 6 in 12 that gives 5 hips × 13 ft × 1.5 = **97.5 ft of hip**, 13 × 1.5 = **19.5 ft of valley** and **32 ft of ridge**. The roof area is (42 × 42 − 16 × 16) = 1,508 sq ft in plan × 1.118 = **16.86 squares**. The highest point is 13 ft of run × 6/12 = **6.5 ft** above the eave edge, measured on the roof planes (add your rafter depth and heel).

| Pitch | Squares | Ridge (ft) | Hips (ft, 5 of them) | Valley (ft) | Peak above eave (ft) |
| --- | --- | --- | --- | --- | --- |
| 4 in 12 | 15.90 | 32.00 | 94.44 | 18.89 | 4.33 |
| 6 in 12 | 16.86 | 32.00 | 97.50 | 19.50 | 6.50 |
| 8 in 12 | 18.12 | 32.00 | 101.63 | 20.33 | 8.67 |
| 12 in 12 | 21.33 | 32.00 | 112.58 | 22.52 | 13.00 |

Those figures come from the takeoff engine, and every one of them can be checked with the arithmetic above.

## When the sketch gets hard

An L, a T or a U still works on paper. A stepped plan, or two wings joined by a narrow link, is where hand sketches go wrong. Some hips there do not start at an eave corner at all. They start higher up, where a ridge meets a valley. And a narrow link gets a low ridge of its own, while each wing rises to a separate peak.

The takeoff now handles any square-cornered outline. It moves every eave line inward at the same rate, which is what a single pitch means: the roof at height h is the outline shrunk by h ÷ (pitch/12). Each outside corner traces a hip, and each inside corner traces a valley. Wherever two facing eaves meet, they leave a level ridge, and the roof may split into separate peaks there. The result is every ridge, hip and valley with its ends and heights, plus their lengths along the slope.

How it was checked:

- by hand on a rectangle, a square, an L, a U and two squares on a narrow link;
- on 300 random square-cornered outlines, against a brute-force roof: every line's height matches the roof surface along its whole length, and the ridge, hip and valley totals match an independent count of the creases;
- with deliberate bugs planted in the code, which the checks caught.

It has **not** been compared against a roofer's measured roof yet. It also assumes one pitch on every plane and level eaves: no gables, no dormers and no mixed pitches.

## Fascia and soffit under the same roof (added 2026-11-26)

The same plan gives you the fascia and soffit order. On a hip roof every side of the house has an eave, and there are no rakes. Each side's eave is the wall plus one overhang at every outside corner, minus one overhang at every inside corner. A square-cornered plan always has four more outside corners than inside ones. So, however stepped the plan is:

**eave length = wall perimeter + 8 × overhang**

Take the stepped 30 × 30 ft plan from the checks above: six outside corners, two inside, 120 ft of wall, and a 12 in overhang. The eave line is 120 + 8 × 1 = 128 ft. Side by side, that is 32, 12, four sides of 10, 12 and 32 ft. With 12 in soffit panels in 12 ft lengths, one course runs under each side. Each 32 ft side takes two whole panels plus an 8 ft piece, and each 12 ft side takes one panel. That leaves four 10 ft pieces and two 8 ft pieces, and no two of them fit in one 12 ft panel. So the total is 12 panels before waste. Fascia is the same 128 ft.

The takeoff now counts this for a plan outline the framing model can't split. It uses the same soffit, fascia, J-channel and frieze rules as the framed roofs. For a plain rectangle it gives exactly what the framed hip roof gives. It doesn't count corner mitres, drip edge, nails or caulk. It also doesn't split vented and solid panels under an outline-only roof yet, because the ventilation sizing reads a framed roof.

## Sheathing the same roof, course by course (added 2026-11-26)

Squares tell you how much roof there is, not how many sheets to buy. Sheets go on in 4 ft courses up the slope from the eave, long edge along the eave, and the hips and valleys change how long each course is. On every plane of a one-pitch hip roof:

- a course is the eave side's length, **minus one course's run at each hip end and plus one course's run at each valley end**, for every course you go up;
- one 48 in course covers 48 ÷ √(1 + (pitch/12)²) of run in plan: **42.93 in at 6 in 12** (45.54 at 4, 39.94 at 8, 33.94 at 12).

Take the L above at 6 in 12. Its long outside eave is 42 ft (504 in) with a hip at each end, so the courses run 504, 504 − 2 × 42.93 = 418.1, then 332.3 in, and a top strip about 30½ in wide. The two short inside eaves are 16 ft (192 in) with a hip at one end and the valley at the other. Their courses stay the same length all the way up: a piece has to reach the hip's line at the bottom of the course and the valley's line at the top, so each one needs 192 + 42.93 = **234.9 in** of sheet, cut on the 45 at both ends.

The takeoff now lays this out for any square-cornered plan. It works out each plane's exact shape from the same rule that gives the hip and valley lines. It splits each course into sheet lengths and cuts the pieces from whole 4 × 8 sheets with the same optimiser that cuts the lumber order. For the L:

| Pitch | Sloped area (sq ft) | Sheets if nothing were wasted | Sheets from the courses | With hip cut-offs reused (below) |
| --- | --- | --- | --- | --- |
| 4 in 12 | 1,590 | 49.7 | 61 | 57 |
| 6 in 12 | 1,686 | 52.7 | 68 | 65 |
| 8 in 12 | 1,812 | 56.6 | 70 | 66 |
| 12 in 12 | 2,133 | 66.6 | 82 | 78 |

The first course count was an **upper bound** that didn't reuse the triangles cut off at hips, and didn't pair a narrow top strip with one of another width, so on a plan with many small planes it ran high (the next section fixes both). For example, it gives 38% offcut on the 30 × 30 ft stepped plan above. It also doesn't land end joints on rafters. For a plain rectangle it gives exactly the sheet count the takeoff's rectangular hip roof already gives, piece for piece. On 120 random plans, every point of the roof falls under a piece of its own plane's course.

The roof plan drawing now has every eave side dimensioned along the eave edge. The bid package we are building prints that drawing ahead of the quantities, so the customer sees the roof they are being quoted for.

## Sheathing it: the hip cut-off is the valley's missing corner (added 2026-11-26)

On a stepped hip roof, counting sheathing by each course's longest edge throws away a lot of plywood. On the 30 × 30 ft stair-step at 6 in 12, that count came to 41 sheets of 4 × 8 for 809 sq ft, or 38% offcut. Most of that waste is triangles.

Lay each course 48 in up the slope from the eave. Where a course ends at a **hip**, the 45-degree cut leaves a right triangle. One leg runs along the course, as long as the course's run in plan (48 ÷ 1.118 = 42-15/16 in at 6 in 12). The other leg runs 48 in up the slope. Where a course ends at a **valley**, the course gets longer toward its top by the same 42-15/16 in. Cut the valley piece to the course's *bottom* length instead, and the gap left at its top corner is exactly that triangle. A cut-off from a hip at the right end of a course fits a valley at the left end of another course just by sliding it over. You don't flip it, so the printed face stays up. Left hips feed right valleys the same way. The joint runs up the slope, like any other end joint.

The second saving is the narrow top courses. A 32-1/2 in strip and a 3-9/16 in strip both come out of one 48 in sheet. Ripping each width from its own sheets wastes the rest.

With both changes, the takeoff's count for the same stair-step falls from 41 to **34 sheets** (25.6% offcut), and from 49 to 44 at 12 in 12. The L above falls from 68 to **65** at 6 in 12, and by 3 to 4 sheets at every pitch in the table. Across 200 random stepped outlines the total is 9% lower. The count is still an upper bound. Hip cut-offs beyond what the valleys need are not reused, and neither are length offcuts. End joints were not yet moved onto rafters here; the next section does that.

How it was checked: a rectangle still gives the plain hip-roof count piece for piece. On 120 random outlines, every sampled point of the roof lies under a piece of its own course, and a reused triangle has to cover the point itself, not just its strip.

## End joints on the rafters, courses staggered (added 2026-11-26)

Cutting every course into plain 8 ft lengths makes the count low, but on a hip plane the course starts at the hip line, not at a rafter. So a joint 96 in along the course usually lands between rafters, and the code books want panel ends over framing. The fix is to pick the joint, not the length: from the end you start at, run each sheet to the **farthest rafter centre it reaches**, cut it there, and carry on from that rafter.

By hand, on a 40 × 28 ft hip roof at 6 in 12 with rafters 16 in on centre and a 12 in overhang. Along the 42 ft (504 in) eave the rafters stand 12 in in from the eave corner and then every 16 in, at 12, 28, 44 … in. The farthest one within 96 in of the corner is at 92 in. After that, 96 in is exactly six spaces, so the joints fall at 92, 188, 284, 380 and 476, and the last piece is 504 − 476 = 28 in. The course above starts at the hip, 42.93 in in. To stagger the joints, the first piece of every other course is at most half a sheet, which puts its first joint on the rafter at 76 in. No joint goes on a rafter the course below already has a joint on unless nothing else is in reach.

The takeoff now does this for any square-cornered plan, using the rafters it frames on that roof. It lists each course's joints and says which ones have no rafter under them, so you can block those. The cost is small:

- the 40 × 28 ft hip roof: all 50 joints on rafters, none lined up, **54 sheets instead of 53**;
- the 30 × 30 ft stair-step: **35 instead of 34**. 26 joints are on rafters. The 6 joints behind a reused valley triangle need a block, because the triangle's shape fixes where they go;
- 80 random stepped outlines at 16, 19.2 and 24 in spacing: **2.9% more sheets** in total. Of 2,922 joints, all but one of those not behind a valley triangle land on a rafter.

How it was checked: every joint marked as on a rafter was matched to a framed rafter at that spot whose length spans that course. No joint shares a rafter with the course below. Each course still covers exactly what the plain layout covered, and that layout is the one checked point by point on 120 random roofs above.

## Blocking the joints that miss a rafter (added 2026-11-26)

A joint with no rafter under it needs something to nail both panel ends to. The takeoff now puts that in the lumber order. For each such joint it lists a nailer the size of the rafters, as long as the course is wide, set on edge under the joint, and a block between the two rafters at each end of the nailer to carry it. Each block is the clear gap between those rafters: the distance between their centres less one rafter thickness (1-1/2 in). Where a hip or valley leaves a rafter on one side only, the block is listed at the rafter spacing less 1-1/2 in, and you cut it to fit.

By hand, on the 30 × 30 ft stair-step at 6 in 12 with 2x8 rafters 16 in on centre: the 6 joints behind a valley triangle each fall in a 16 in bay, so each block is 16 − 1-1/2 = **14-1/2 in**. Four of those joints are on 48 in eave courses and two are on the 32-1/2 in course above, so the order gains **4 nailers of 48 in, 2 of 32-1/2 in and 12 blocks of 14-1/2 in**, all 2x8, cut from the same boards as the rafters. They show up in the board order and in the supplier material list as "sheathing nailer" and "sheathing block". Across the 80 random outlines, every joint with no rafter under it got exactly one nailer and two blocks.

The takeoff does not size or check this blocking. Check it against the nailing schedule for your roof sheathing.

## Reusing the hip cut-offs a second time: turn them end for end (added 2026-11-26)

The valley corners use only some of the hip triangles. A plain hip roof has no valleys at all, so every triangle there went in the scrap pile. That pile is about one sheet in six.

There is a second place a hip triangle fits. Take the triangle cut off the right-hand hip end of one course and turn it end for end on the roof, keeping the printed face up. Its square corner is now at the bottom, and its long cut edge is now parallel to the hip. That is exactly the corner the next course needs where it meets the hip. Put the triangle there, and the sheet beside it only has to reach the course's *top* length, not its bottom length. On a 6 in 12 roof that sheet is 42-15/16 in shorter, and it leaves no triangle of its own. Left-hand hips work the same way. The panel's long edge still runs along the eave, across the rafters, so its strength direction does not change.

Because a hip end that takes a triangle gives up its own, the takeoff fills valley corners first. Then it starts hip ends that are too short to give a triangle anyway, and then every other hip end up each hip. It keeps the result only when the sheet count goes down; otherwise it lays the roof as before. By hand, on a 40 × 28 ft hip roof at 6 in 12 (42 × 30 ft at the eaves): the second course on the long side starts with the first course's left-hand triangle at the hip, 42-15/16 in from the eave corner. Its first sheet starts 85-7/8 in along. The third course is cut to its bottom length again and gives its own triangle to the fourth.

| Roof (12 in overhang) | Pitch | Before | With turned cut-offs |
| --- | --- | --- | --- |
| 40 × 28 ft hip roof | 6 in 12 | 53 sheets (16.9% offcut) | **47** (6.3%) |
| 30 × 30 ft stair-step | 6 in 12 | 34 (25.6%) | **30** (15.7%) |
| 30 × 30 ft stair-step | 12 in 12 | 44 | **39** |
| The L above | 4 / 6 / 8 / 12 in 12 | 57 / 65 / 66 / 78 | **55 / 59 / 61 / 74** |

Over 200 random stepped outlines the total fell from 7,631 to 7,003 sheets, 8.2% fewer. None of them came out higher.

The cost is one more end joint per turned triangle, where triangle meets sheet, and it usually falls between rafters. With the roof framed at 16 in on centre, the 40 × 28 ft roof goes from 54 sheets with no joint to block to **48 sheets with 13 joints to block**. The takeoff now lists a nailer and two blocks for each of those joints in the lumber order. Across 80 random framed outlines it was 8.4% fewer sheets. Six sheets of plywood cost more than 13 short nailers and 26 blocks cut from rafter scrap, but the trade is yours to make. The engine can lay the roof without turned triangles, though that switch is not on the page yet.

How it was checked: on 120 random outlines, every sampled point of the roof is still under a piece of its own course. A turned triangle is tested as the shape it really is, widest at the bottom of the course, unlike a valley triangle, which is widest at the top. The turned triangles never outnumber the hip ends that gave one. With turned triangles switched off, a rectangle still matches the takeoff's plain hip roof piece for piece. Triangles from a full course are not yet trimmed down for the narrow top course, and the count is still an upper bound, because leftover triangles and length offcuts are still not reused.

## A trap on stepped plans: two eaves on one line (added 2026-11-26)

Picture a plan with a bump-out between two lower sections, where the eaves on either side of the bump-out sit on the same line. Those two eaves feed **one** roof plane. Behind the bump-out they join, and nothing on the roof marks where one eave's part ends and the other's begins. No hip, no valley, no ridge. If you lay sheathing by working out each eave's plane separately, the place where one part runs out is easy to miss. That is where the other part's course turns a corner, and a course measured only at the hips and valleys comes out short there.

Our takeoff had exactly this bug. It measured each course at the heights where the roof lines meet, and this corner sits at none of them. On a four-column stepped house (89 in columns, 6 in 12, 18 in eaves) the planes added up to 1004.18 sq ft against the eave line's 1003.06, so the takeoff refused the plan. Worse, across 400 random comb-shaped plans (steps on both long sides), 23 plans had a course as much as one full 8 ft sheet short of the roof, and the area check did not notice. The takeoff now also checks each course at the depth where each eave's share of a plane runs out. All 400 plans are now covered piece for piece, checked at 19 depths in every course. The other 199 stepped plans from the test above came out the same, sheet for sheet.

If you sheathe a plan like this by hand, measure the shared plane as one piece and look at the course lengths behind the bump-out.

## A bay window: when hips stop running at 45 degrees (added 2026-11-27)

The 45-degree rule above holds only where the walls meet square. A bay window with 45-degree sides, a clipped corner or a wing set at an angle has corners of 135 degrees, and there the hip bisects the corner instead. In plan it runs at 67.5 degrees to each wall, not 45. Measure its run the same way, square off one of the eaves it starts from, and use a different multiplier:

| Corner (inside the walls) | Plan length per foot of run | Hip or valley length per foot of run at 6 in 12 |
| --- | --- | --- |
| 90 degrees (square) | 1.414 | 1.500 |
| 135 degrees (a 45-degree bay or clipped corner) | 1.082 | 1.192 |

The plan factor is 1 ÷ sin(half the corner): 1 ÷ sin 45° = 1.414 for a square corner and 1 ÷ sin 67.5° = 1.082 for a bay corner. To get the length along the slope, add the rise as before: √(plan factor² + (pitch/12)²). An inside corner of 225 degrees, where a bay side meets the house wall, gets the same 1.082: its valley bisects that corner too.

**Worked example.** Take a 40 × 24 ft house at 6 in 12 with 12 in eaves. On one long wall sits a bay that is 8 ft wide where it meets the wall, 4 ft across its front and 2 ft deep, with 45-degree sides.

- **Without the bay:** 12.21 squares, 136 ft of eave, a 16 ft ridge and four hips of 19.5 ft (78 ft).
- **The bay's own hips:** its two front corners send hips inward. They meet over the bay's centre line, 5.83 ft of run in from the front eave, at 6.95 ft each along the slope. From there a short hip climbs the centre line between the two bay sides, which are square to each other, so it takes the square-corner plan factor: 4.83 ft of run, 7.24 ft along the slope.
- **Two valleys:** one from each corner where a bay side meets the house wall, 10.66 ft of run, so 12.71 ft each along the slope. They meet the short centre hip at its top, 10.66 ft in from the house's own eave, where the bay's roof dies into the house's front slope.
- **With the bay:** 12.36 squares, 137.66 ft of eave, the same 16 ft ridge, 99.14 ft of hip in seven pieces and 25.41 ft of valley in two.

So the bay adds 0.15 squares of roofing, but 21 ft of hip cap and 25 ft of valley flashing. A roof report that skips the bay, or prices those hips at the 45-degree factor, comes out short on exactly the items that are priced by the foot.

The takeoff now draws the roof over outlines with angled sides as well. The method is the one above: every eave moves inward at one rate, and each corner traces a hip or valley along its bisector. The eave line's corners are mitred, set where the two eave lines meet. How it was checked:

- on the 300 random square-cornered outlines from before, it gives the same ridge, hip and valley lengths, line counts, peak and volume as the square-cornered method, also with each outline rotated and mirrored;
- a regular octagon and a rectangle with clipped corners match their closed forms, and the bay above was worked by hand;
- on 800 random outlines with sides at any angle, every line is inside the outline and lies where at least two roof planes meet, and no point is higher than its distance to the walls allows.

It gives squares, eave length and every ridge, hip and valley. It does **not** yet lay out rafters or sheathing courses on angled planes, and it says so instead of guessing. It has not been compared with a roofer's measured roof.

## Where to use it

This is part of the estimating module we are building for the contractor suite, and it is not on the free framing page yet. Until it is, the multipliers above get you there by hand for an L, T or U, and the bay table for a 45-degree bay. The free [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) already counts studs, plates, headers and the board order for the walls under that roof.

Quantities only, not engineering: hip and valley rafter sizes, bearing and connections are for your engineer or the local building department.
