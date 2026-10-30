---
title: "How hard does a shed block press on the ground?"
date: 2026-10-30
tags: [shed-designer, foundation, structure]
description: "The shed designer's starter set 4x8x16 blocks straight on the soil. Loaded with a floor, walls and snow, each one presses about 1,970 psf, against the 1,500 psf the IRC presumes for clay or silt."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) can stand a shed on pressure-treated skids laid on concrete blocks. Until today it checked the joists above the skids, but not the skids themselves, and not what the blocks do to the ground. Those two checks are new, and the second one changed the starting design.

**The skid as a beam.** On blocks, a skid is a beam from one block to the next: about 43" on centre, since blocks go at each end and no more than 4 ft apart. Treated skids from a big-box store are usually Southern pine, and on blocks they stay damp. So the check uses Southern pine No. 2 (SPIB's 2013 reference values) with the wet-service factors:

- shear × 0.97;
- bearing across the grain × 0.67;
- stiffness × 0.9;
- bending unchanged, because the 4x4 and 4x6 values (1,100 and 1,000 psi) are under the 1,150 psi above which the 0.85 factor applies.

The loads on a skid:

- its strip of floor, at 10 psf dead and 40 live;
- on an outer skid, the eave wall at 10 psf and the roof that wall carries;
- the combinations D+L, D+S and D+0.75L+0.75S.

The skids come out comfortable. The starter's 4x4 is the worst at 46% of capacity, in bending.

**The block on the ground.** The reaction at a block is about 1.14 times the load over one span on a long skid, and 1.25 times on a two-span skid. On the starter (an 8x12 with a ridge beam and three 4x4 skids), the middle skid puts about 1,700 lb on each inside block. Add a 50 lb allowance for the block and skid, and a 16" x 8" block (0.89 sq ft) on bare ground presses about 1,970 psf.

The IRC's table of presumptive soil values (R401.4.1) starts at 1,500 psf, for clay and silt, and that is the value to use when nobody has looked at the soil. So the starter was at **1.32 times** the code's floor value.

**The fix is cheap.** A 4" bed of compacted paver base under each block, 2" wider all round, spreads the load over 20" x 12" (1.67 sq ft). That brings the starter to 70%. The tool already offered that option, and the starting design now uses it: 14 bags of paver base, which takes the starter from $3,048.40 to $3,131.98 at the listed prices. A full gravel pad also passes.

| Starter, 3 skids on 4x8x16 blocks | Pressure on the soil | vs 1,500 psf |
|---|---|---|
| Blocks straight on the ground | about 1,970 psf | 1.32 |
| 4" paver-base bed under each block | about 1,050 psf | 0.70 |

**One more change.** Treated floor joists are now checked as Southern pine too. Southern pine No. 2's bending value for a 2x6 (1,000 psi with its size factor in) is lower than SPF's (875 × 1.3 = 1,137 psi), so the floor joist ratios rise by about 14%. None comes close to failing: the starter's joists are at 17%.

These are screening checks with stated assumptions, not an engineer's review, and the plans are not engineered or code-checked. Firm sand or gravel soils carry more than 1,500 psf, and soft or frost-prone ground can carry less. If the ground is doubtful, ask someone local who has dug in it.
