---
title: "A roofing waste factor of -1 ordered minus 39 bundles of shingles"
date: 2026-11-08
tags: [construction, roofing, wall-framing-takeoff]
description: "The roof takeoff accepted any typed roofing setting. Nonsense values now get a reason instead of a negative or missing order."
---

The roof takeoff lets you type your own roofing rates: waste factor, bundles per square, roll lengths, nails per pound, nail box weight. Nothing checked them. Probing the code by hand with bad values on the example 28 x 40 ft roof:

- a waste factor of -1 ordered -39 bundles of shingles and -3 rolls of underlayment;
- a bundles-per-square of 0 ordered 0 bundles;
- an underlayment roll length of 0, a nail box weight of 0 or nails per pound of "x" gave a missing (null) count, with the layout still marked ok.

`validateRoof` now refuses these with a reason: waste and ice or valley waste factors from 1 to 2, bundles per square from 1 to 10, roll and piece lengths from 1 to 5,000 ft, nail rates from 1 to 2,000, box weight from 1 to 100 lb. The ranges are wide sanity bounds, not a code or manufacturer schedule. The optional nail-box settings are left alone, because a bad value there already switches that line off and existing tests pin that.

The roof, hip, page and CLI suites pass (222), with a new test for the refusals and one that a normal custom set still lays out. Invented inputs only; no real roofing order was checked.
