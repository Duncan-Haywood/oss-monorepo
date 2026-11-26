---
title: "How much siding for a gable end? The triangle and the band under the rake"
date: 2026-10-29
updated: 2026-11-26
tags: [wall-framing-takeoff, for-customers, construction]
description: "Gable-end siding area worked by hand at 4, 6, 8 and 12 in 12, plus the strip between the top plate and the rake that square-foot estimates often miss, and how the framing takeoff counts both."
---

A gable end has more siding on it than the wall below. A quick estimate takes wall length times wall height and stops there. Real siding runs up to the rake, though, and that adds two pieces. One is the **triangle** above the eave line. The other is the **band** between the top plate and the underside of the rake. On a raised-heel truss that band can be a foot tall.

## The triangle

On a symmetric gable the triangle is half the wall length times the rise. The rise is half the wall length times the pitch over 12. For a 28 ft gable wall:

| Pitch | Rise (ft) | Triangle (sq ft) |
| --- | --- | --- |
| 4 in 12 | 4.67 | 65.33 |
| 6 in 12 | 7.00 | 98.00 |
| 8 in 12 | 9.33 | 130.67 |
| 12 in 12 | 14.00 | 196.00 |

For example, 0.5 × 28 × (14 × 4/12) = 65.33 sq ft at 4 in 12. Each lap course in the triangle is as long as the triangle is wide at that course's lower edge, because the boards are cut to the slope. The offcuts from the long courses can start the short ones.

## The band under the rake

The siding stops at the underside of the rake: the rake board, or the soffit under a rake overhang. Where the gable wall meets the eave wall, that underside usually sits some inches above the top plate. Call that height the heel. A raised-heel (energy-heel) truss puts it on the truss drawing. With stick framing you read it off the wall section. Below that height the siding runs the full length of the wall, so the band adds **wall length × heel** to every gable end:

| Heel | Band on one 28 ft gable (sq ft) | Two gable ends |
| --- | --- | --- |
| 4 in | 9.33 | 18.67 |
| 8 in | 18.67 | 37.33 |
| 12 in | 28.00 | 56.00 |

On a 40 × 28 ft ranch at 4 in 12, the two triangles add 130.67 sq ft. An 8 in heel on both ends adds another 37.33 sq ft, about 29% more than the triangles alone. That works out to a few extra courses of boards and a little more house wrap. It is easy to miss if you price siding by the square foot.

## How the framing takeoff counts it

The wall-framing takeoff counts siding course by course on each sheathed wall. Openings are cut out, and offcuts are packed into the board length you buy. Set the siding's gable ends to come "from the roof", or type a `gable` pitch on a wall, and that wall's triangle goes into the boards and the wrap at its true area. The band under the rake (`rakeHeel` in the plan, "Band under the rake on gable walls" on the page) is a height you type. The takeoff never guesses it. Every gable wall then gets a band that tall along its whole length under the triangle. The courses, vertical boards, battens and wrap all reach the top of the band, and a gable vent that sits in the band is cut out of it. Level walls, corner boards and the wall sheathing keep the wall height. Leave the field blank and the material list says the band is not counted.

The figures above are checked against the program's tests: a 6 in band on two 10 ft gable walls adds 10 sq ft and one course each, and the sample house's 8 in band adds 37.33 sq ft. They have not been compared with a real siding order. The exposure, board length, waste and prices are the ones you type, and rake trim and the rake overhang's own soffit are not counted.
