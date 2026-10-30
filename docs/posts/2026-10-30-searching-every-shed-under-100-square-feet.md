---
title: "Searching every shed under 100 square feet"
date: 2026-10-30
tags: [shed-designer, optimisation, design-search]
description: "We framed, priced and checked 1,500 gable sheds under 100 sq ft. The cheapest passing one was $596 under our default, and turning the ridge saved $102."
---

A builder and a homeowner walked through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) with a real shed in mind. It had to stay under 100 sq ft so it needs no permit where they live, it had to look good next to the house, and it had to hold as much as possible for as little money as possible. Their budget was about $2,000. Our default 8x12 came to $3,026 in materials.

Until now the tool could only nudge the design you already had. So we built a search over whole designs.

**What it tries.** It starts with every whole-foot size from 80 to 100 sq ft: 10x10, 9x11, 8x12, 7x14, 6x16 and the rest. It tries each with the ridge running either way and with five door-and-window layouts. Then it varies the structure: ridge board or ridge beam, pitch from 4/12 to 9/12, overhang, wall height, studs and rafters at 16" or 24", 2x4 or 2x6 rafters and joists, foundation blocks, and a plywood or OSB floor. Each design is framed board by board and priced. It also runs through every structural and connection check the tool has. A design that fails any check, or goes over the footprint, the 13 ft peak limit or the wall-height range, is dropped.

**Three scores, not one.** Cheaper, bigger and better-looking pull against each other, so the search keeps the *Pareto front*: the designs that nothing else beats on all three at once.

- **Cost** is the materials total before tax.
- **Storage** is usable volume: the inside floor area times the clear height under the plates, plus the triangle under the roof. Under a ridge board that triangle sits above the rafter ties, so we flag it as loft space you have to deck first.
- **Looks** is a heuristic score out of 100, built from seven rules of thumb, each with its reason: a 6/12 to 9/12 pitch like most house roofs, the roof as 30% to 45% of the gable's height, a plan 1.2 to 1.6 times as long as it is wide, an 8" to 12" overhang, a 7 to 8 ft sidewall, openings mirrored on their wall, and window heads in line with the door head. It is a heuristic, and you may disagree with it.

**What a 1,500-design run found,** on the tool's default Home Depot prices of 2026-10-29:

- 1,304 designs passed every check and limit; 84 of them made the front.
- The cheapest passing shed was an 8x10 at $2,430.94, $595.52 under the default 8x12. It has 2x4 rafters at 24" on a ridge board with ties, a 5/12 roof and no windows. Its most heavily loaded part, the nailing at the rafter-tie heel, sits at 81% of capacity.
- Every design on the front used a ridge board, not a ridge beam. The beam leaves the room open to the roof, but it does not pay for itself on any of the three scores as we measure them.
- **Turn the ridge.** An 8x12 with its ridge along the 8 ft side and the door in a 12 ft gable end came to $2,736.58. The same shed with the ridge along the 12 ft side came to $2,838.15, so turning it saved $101.57. It also has 42 cu ft more space under the roof, because the triangle spans the wider side. In exchange the peak is 12" higher.
- The "balanced" pick, nearest to best on all three, was that turned 8x12 with 8 ft sidewalls and a window in the far gable: $2,893.20, 785 cu ft and a looks score of 93.

None of these reach $2,000 yet. The default prices still include things the owners asked to change, such as T1-11 siding where they want painted lap siding. Siding, doors and windows are being added to the search's choices next, so cost can be traded against them too.

**What this is not.** The structural checks are allowable-stress checks against NDS values, and the tool is not engineered or code-checked. A 100 sq ft limit is a common permit threshold, not a universal one, and some places measure it including the overhang. Check your own rule.

The engine is `ventures/shed-designer/designsearch.mjs`. It is MIT-licensed, it takes about 7 s for 800 designs in Node, and its tests check that every design it returns passes the same checks again.
