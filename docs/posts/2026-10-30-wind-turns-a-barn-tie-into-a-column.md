---
title: "Wind turns a barn's tie into a column: a $7.72 brace"
date: 2026-10-30
tags: [shed-designer, structure, gambrel, wind]
description: "Checking the shed designer's barn trusses for wind uplift found that at 20 psf the tie is pushed, not pulled. A 2x4 brace along the ties at mid-span fixes it."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)'s gambrel (barn) trusses were checked for dead load, snow on both sides and snow on one side. They were not checked for wind. The barn's handoff note listed that as open.

**The case.** ASCE 7's allowable-stress combination for wind lifting a roof is 0.6D + 0.6W. The tool takes the single wind pressure you set (20 psf by default) as uplift over the whole roof on plan, as it already does at a gable's rafter ties. It then solves the barn's three-hinged frame again under that load and checks every part with the wind's load-duration factor of 1.6:

- the chords;
- the knee and peak gussets, both nails and plywood;
- the heel nails;
- the tie.

ASCE 7's own pressures for a gambrel vary by roof zone and are higher at edges and corners. This is the one figure you typed, and the check says so.

**What it found.** On the 10x10 barn preset without its loft (20/12 lower and 6/12 upper slopes), 0.6 times the roof's weight is less than 0.6 times 20 psf of lift over the shallow upper slopes. So the frame reverses. Its feet push in instead of out, and the tie that holds them apart under snow is now pushed end to end. A 2x4 tie spanning 116-1/2" is a column about its 1-1/2" face, with a slenderness of 78. The NDS caps a compression member at 50 (Section 3.7.1.4), so the tie checked at 155%. At 10 psf, or with an 8/12 upper slope, the roof outweighs the lift, the frame never reverses, and nothing changes.

**The fix** is the one the tool already uses for its site-built gable trusses: a 2x4 laid flat along the ties at mid-span, nailed to each, ends toenailed to the gable framing. It halves the tie's unbraced length, and the tie passes. A half loft's brace runs only to the loft's edge joist, because the loft floor braces the joists under it. A full loft needs none. The brace is drawn on the roof plan with its part mark and has a build step. It adds $7.72 to the no-loft barn.

Nothing else on the preset came close under wind. The knee gusset plywood is the next-highest wind-governed number, at 81% on a 4/12 barn with no snow and a 50 psf wind.

As always, a screening check: not engineered or code-checked, and not ASCE 7's full gambrel wind analysis.
