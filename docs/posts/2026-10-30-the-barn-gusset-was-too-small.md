---
title: "The barn's knee gussets were too small, and the search now shapes the barn"
date: 2026-10-30
tags: [shed-designer, structure, gambrel, search]
description: "Checking the gambrel's plywood gussets against APA's published capacities showed them at 334%. They now reach into the corner. The search also varies the barn's shape and loft."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)'s gambrel (barn) roof is framed as site-built trusses. Each truss has four chords, joined at the two knees and the peak by 15/32" plywood gussets on both faces. Until today the tool checked the gussets' nails but not the plywood. The handoff note from the lane that built the barn said so, and asked for the plywood check to cite APA's *Panel Design Specification* before it was added.

**The values.** APA's Panel Design Specification (ANSI/APA D510-2020, Table 9) gives capacities for Rated Sheathing 32/16, the span rating 15/32" sheathing carries:

- tension, 1,250 lb per foot of width across the strength axis;
- compression, 3,100;
- shear through the thickness, 62 lb per inch.

These are the 3-ply values, the lowest. PDS Section 4.8 says to assume the lowest construction available for a span rating, and 3-, 4- and 5-ply are all sold as 32/16. They are also the values across the strength axis, the weaker direction, because a knee gusset is loaded at an angle to the grain. PDS Section 4.5.5 reduces bending and tension for strips under 24" wide, to half under 8".

**The method, and whose it is.** PDS gives no value for bending a panel in its own plane, edgewise. So the tool checks the knee moment the way a beam is checked: as the stress at the edge of the gusset's section across the mitre, against PDS's tension and compression capacities used as stresses. That use of PDS's numbers is this tool's choice, not APA's, and the check says so where it shows its working.

**What it found.** The model drew each knee gusset the same depth as the chords. Across the mitre, that is a strip of 15/32" plywood 3-5/8" deep, carrying the whole knee moment between two cut chords. On the 10x10 barn preset it checked at **334%**, and at 60 psf of snow at 717%. The nails had passed, at 71%, because the nail group spreads 10" along each chord. The panel section was the weak link.

**The fix** is what barn builders do anyway: make the gusset bigger than the chords. The tool now lets each knee gusset reach into the inside corner. It uses the shortest reach whose section across the mitre passes, up to the 24" depth PDS 4.4.5 allows without a buckling check. On the preset that is 2-3/4" past the chords' inside edges, which brings the plywood to 93%. At 60 psf the reach is 5-1/4" and the plywood is at 95%. The truss detail sheet draws the bigger gusset and says why. The extra plywood comes out of offcuts, so the preset's price did not change. The peak gussets carry only the thrust and a little shear, at 13%.

**The search shapes the barn now too.** It used to take the barn's shape as given. It now tries:

- the lower slope: 18, 20, 22 and 24 on 12;
- where the bend sits: a fifth, a quarter or a third of the width in;
- a loft over none, half or all of the length;

all under the 13 ft peak limit. On any other roof style these knobs are pinned, so no gable is built twice for them.

There is also an opt-in objective, **usable storage**. It counts the room, the roof space where it is open to the room, and the space over a deck. Space over bare ties counts nothing until it is decked. On the 10x10 barn preset, a loft over the whole length instead of none costs $242 more and adds 283 cu ft of storage you can load today.

In a 400-design barn search with the gallery's settings:

- **most volume per dollar:** an 8x12 with no loft, $2,823.87 for 812 cu ft, of which 596 is usable without decking;
- **most usable storage per dollar:** an 8x10 with a full loft, $3,098.62, all 667 cu ft of it usable.

Which one a person wants depends on whether they will deck the ties themselves. The gallery and the search's defaults belong to another lane, which can now pick this objective.

As always, this is a screening tool: not engineered or code-checked. The gusset check rests on one published table and one stated method, and an engineer would look at the whole joint.
