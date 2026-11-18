---
title: "Average haul from the cut and fill centroids can only come out short, and on some sites it says zero"
seo_title: "Least average haul for earthwork, solved exactly in the browser"
date: 2026-11-18
tags: [earthwork-cut-fill, construction, optimization, open-source]
description: "The earthwork tool now plans the haul: least volume times distance, proved optimal by LP duality, beside the centroid shortcut, which is never over."
---

[The earthwork cut and fill calculator](https://marisstella.app/earthwork-cut-fill/) used to stop at the totals: so many cubic yards of cut, so many of fill, this much left over to export. An estimator pricing the job also needs to know how far the dirt goes, because a scraper or truck is paid by the hour and the hours scale with distance. It now answers that too, with a haul plan.

## What it computes

The site is cut into square cells (the size is picked for you, at most 900 cells). In each cell the cut and the fill are computed exactly from the triangulated surfaces, the same way as the totals. Cut that can fill its own cell stays there. What is left is a classic linear programme, the transportation problem. Cells with spare cut supply bank cubic yards. Cells short of fill ask for them, with each compacted yard needing 1 / (1 − shrink) bank yards. Moving a yard costs the straight-line distance between the cells' centres. The answer is the plan with the least total volume × distance. Mathematicians call that number the earth mover's distance, which was named after exactly this job.

The page shows the average haul and the haul moment in station-yards (cubic yards × 100 ft). The map gets arrows for the largest moves, and every move goes into a CSV.

## Proved, not searched for

The solver is the transportation simplex, written for this page in about 150 lines of JavaScript. Volumes are scaled to whole numbers first, so the pivots add and subtract whole numbers and never pile up rounding. When it stops, it prices every possible cell-to-cell move against the dual potentials. If none could make the plan cheaper, linear-programming duality says no plan on that grid is cheaper. The page then says the plan is proved, and it says so only when the check passes.

How it was checked:

- On 60 random instances it gives the same optimum as a separate min-cost-flow solver written another way (successive shortest paths).
- On 40 random one-dimensional instances its optimum equals the area under the classical mass-haul curve: the integral of |cumulative cut − cumulative fill| along the line. That curve is what highway estimators have drawn by hand for a century, and in one dimension it is exactly the least haul.
- On six real grids, up to 850 cells and a 489 × 362 programme, SciPy 1.18.1's HiGHS solver agrees to 3 parts in 100 billion. The 850-cell plan took half a second in Node.

The output is in [`check/HAUL_RESULT.txt`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/earthwork-cut-fill/check/HAUL_RESULT.txt).

## The shortcut, and why it is always short

The quick way to estimate average haul is to find the centre of the cut, find the centre of the fill, and measure between them. The tool shows that number next to the real one, because it has a property worth knowing: **it can never come out over the true least haul.** Here is why. Pick the direction from one centre to the other and score each yard by how far along that direction it sits. Moving a yard can't change its score by more than the distance it travels. Every yard of cut ends up as fill, so the total travelled is at least the total change in score, and that total is the gap between the two centres times the volume. Optimal-transport texts call this Kantorovich–Rubinstein duality.

How short it comes out depends on the shape of the site:

- **The made-up hillside example, pad at the balance elevation (15% shrink, 10 ft cells).** The least average haul is 105.9 ft and the centroid shortcut gives 105.4 ft, 0.4% short. Here cut is on one side and fill on the other, nearly a straight shove, and the shortcut is close to exact.
- **A made-up round mound, levelled to its balance elevation (10 ft cells).** The cut is in the middle and the fill is a ring around it, so the two centres sit on the same point. The shortcut says **0 ft**. The least average haul is **66.9 ft**, over 338 bank cubic yards that cross cells.

Neither site is real; both are generated in the repository's tests so anyone can rerun them. The second shape is common enough on real jobs: a knoll levelled into its own low ground, or a basin dug in the middle of a pad. On those, a bid priced from the centroids would leave the haul out.

## What it does not know

The distances are straight lines between cell centres, not haul roads. Real haul goes round the building pad, up ramps and through gates, so read the average haul as a floor when pricing. The plan minimises volume × distance and knows nothing about free-haul limits, equipment, or the order the site has to be built in. Dirt moved within one cell is counted as moved but not hauled.

The next useful steps are barriers that the haul must go round (shortest paths on the grid instead of straight lines), and a borrow pit or spoil site location so export and import get a distance too. A free-haul limit with overhaul station-yards, and a one-dimensional mass-haul diagram along a road centreline, would come after that.

Everything runs in the browser, and the survey never leaves it. The source and the CLI (`node cli.mjs --example --balance --shrink 15 --haul`) are [in the repository](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/earthwork-cut-fill), MIT licensed. It is an estimate, not engineering advice: check it against the engineer's grading plan and your own takeoff before you bid.
