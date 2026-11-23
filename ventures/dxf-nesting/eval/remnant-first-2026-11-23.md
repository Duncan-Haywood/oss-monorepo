# Offcuts first: what the worked example saves (2026-11-23)

`node eval/remnant-first.mjs` (about 8 s). The worked example's 72 made-up mild steel parts (gap 5 mm, margin 10 mm, turns 0/90/180/270), nested once on new 2500 x 1250 sheets only and once with an L-shaped offcut listed first: 1600 x 1000 with a 700 x 450 corner and a 250 mm disc already cut out (1.236 m2 of steel; `exampleRemnantDxf()` in `job.mjs`).

| stock | search | sheets | new sheet used, m2 (used length x 1250) | check |
|---|---|---|---|---|
| new sheets only | 0 | 2500 x 1250: 72 parts, 1912 mm used | 2.390 | pass |
| new sheets only | 60 | 2500 x 1250: 72 parts, 1912 mm used | 2.390 | pass |
| offcut first | 0 | offcut: 28 parts, 1576 mm used; 2500 x 1250: 44 parts, 1150 mm used | 1.438 | pass |
| offcut first | 60 | offcut: 35 parts, 1566 mm used; 2500 x 1250: 37 parts, 1124 mm used | 1.405 | pass |

With the page's default search the offcut takes 35 of the 72 parts and the new sheet's used length falls from 1,912 to 1,124 mm: 0.985 m2 less new sheet, 41% of what the job used before. "check" is `verify`, which for a remnant measures every part's distance from the offcut's real outline and its cut-out, not its bounding box.

What this does not show: the parts and the offcut are made up, so the saving on a real shop's job depends on how big its offcuts are against its parts. The objective after "place every part" is fewest sheets, then least stock area opened, then the shortest last sheet; stock is used in the order listed, so the list order is the shop's priority (it does not price sheets).

Checks of the new code (`stock.test.mjs`): on 30 random star-shaped outlines with a rectangular cut-out at random cell sizes and margins, every corner and centre of every free cell is inside the outline and at least margin + tol from it; a rectangular stock line gives the identical placements the single-sheet nester gave; stock runs in the listed order and runs out with the rest reported; on six random jobs on an L-shaped offcut with a round cut-out every vertex of every placed part lies on the offcut at least the margin from its edges (checked separately from `verify`, which also passes); `verify` catches a part over a cut-out, including one that covers the whole cut-out with no vertex in it; a remnant DXF reads back from the output's SHEET layer with the same area.
