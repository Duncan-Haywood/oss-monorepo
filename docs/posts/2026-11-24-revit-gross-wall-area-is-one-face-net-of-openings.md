---
title: "Revit's gross wall area was one face with the windows taken out"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, revit, quantity-takeoff, ventures]
description: "Three wall areas an IFC takeoff could not explain match one wall face net of its openings to 1e-6. Five walls in two Revit models; 3 figures left in doubt."
---

The [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
reads a BIM model in the browser and turns it into a bill of quantities. It
checks every quantity the model stores against the geometry. When the two
disagree it tries to name the reason, and when it cannot, the bill's line
says the figure is "in doubt" and shows both sums.

This morning, over 15 public models, 1 volume and 6 areas were still in
doubt. Three of the areas belonged to one Revit model, a Norwegian school
(ARK_NUS skolebygg in the `web-ifc` test files). They were straight walls
with doors or windows in them, 2.4%, 6.4% and 49.7% off.

## What the numbers were

The takeoff already measures a wall's side area three ways: on its middle
plane and on each of its two faces, each gross and net of openings. Printed
side by side, the stored `GrossSideArea` of each wall matched one of those
six figures to six decimals:

| wall | stored "gross" m2 | middle plane, gross | the longer face, net |
|---|---:|---:|---:|
| #556796, 145 mm partition, 1 door | 3.747429 | 3.659 | 3.747429 |
| #1280178, 172 mm partition, 1 door | 15.087303 | 16.052 | 15.087303 |
| #1483180, 134 mm partition, 3 openings | 9.627227 | 14.407 | 9.627227 |

So Revit's "gross side area" on these walls was the longer face with the
openings taken out. The tool had a rule for a gross area that is really net
(on the middle plane) and one for an area measured on a face (gross). This
needed both at once. The new rule, `net-on-a-face`, requires the wall to
have an opening and the match to be within 0.5%.

It also matched two more walls: a 302 mm wall in the same school, and a
240 mm brick wall in a German Revit model. Both had been put down to a
looser cause (stored area x width equals stored volume), so their bill
didn't change. That makes five walls in two models, and in every case
Revit used the longer face.

## What it changed, and what it didn't

The bill's totals did not move on any of the 15 models. These areas are
real, measured faces, so the bill still sums them. What changed is that
three lines stopped saying "in doubt", and five rows got a more exact
reason. The full list of changes, with totals, is in the
[eval file](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/net-on-a-face-reasons-2026-11-24.txt).

Now 1 volume and 3 areas are left. The three areas are zinc copings whose
geometry is a boolean of 183 pieces. The volume is a short school wall
whose stored volume is 2.04% above its body. That is just past the 2%
tolerance, while nine other walls in the same model with no openings are
off by 0.6% to 1.9% in the other direction. Revit's join clean-up probably
explains it, but nothing in the file shows that, so the row stays in doubt
and the bill still says so.

## Why an estimator should care

A face net of openings is a reasonable figure for plasterboard or paint on
one side. It is the wrong figure for the wall itself, and it is labelled
"gross". For the wall with three openings, the stored figure is two thirds
of the gross area. If you price framing or both faces from that field, you
are about a third short on that wall. The takeoff now tells you which
figure you are looking at. It does not decide which one your trade prices.

Method, tables and limits:
[eval/net-on-a-face-2026-11-24.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/net-on-a-face-2026-11-24.md).
