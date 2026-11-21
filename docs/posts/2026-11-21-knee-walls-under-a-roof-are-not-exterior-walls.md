---
title: "Knee walls under a roof are not exterior walls: teaching an IFC takeoff to see roofs"
seo_title: "Knee walls in an IFC takeoff: roofs as envelope blockers"
date: 2026-11-21
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now lets sloped roofs stop its envelope rays. On one Dutch model, flag agreement went from 815 to 853 of 922 walls."
---

An elemental estimate prices exterior walls (Uniformat II B2010) and
partitions (C1010) separately, and a metre of facade costs a lot more than a
metre of stud partition. Many IFC models never say which is which, so the
free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
works it out from the geometry. It casts horizontal rays from each face of a
wall, and a ray that crosses no other wall has left the building. A wall
with one face open is on the outside.

That test had a known blind spot: it only knew about walls. Picture the attic
of a Dutch terraced house. A short wall, under a metre high, stands two
metres in from the eaves, and the roof comes down behind it to the outer wall.
That is a knee wall (`knieschot`), and it is plainly inside the house. A
horizontal ray from its back face passed under the roof, over the low eaves
wall and out, so the test called it exterior.

## What changed

Sloped roofs now stop rays, with three conditions, each one learned from a
wall it got wrong:

- **The roof has to come down across the ray.** At the height a wall's rays
  are cast, each roof piece is cut into lines in plan, and each line keeps
  which way its face slopes. A ray from a knee wall meets the underside of a
  roof falling toward the eaves: it is under the roof. A ray from a small
  upstand on the roof meets the top of a roof rising toward the ridge: it is
  above the roof, and outside.
- **There has to be a wall beyond the roof.** The ray must also cross, in
  plan, a lower wall beyond the line where it met the roof: the eaves wall
  the roof comes down onto. Without one, the roof it met is an overhang
  outside an exterior wall, and the ray has still left. The first version
  counted the foundation wall right under the wall being tested as "a wall
  beyond", which turned every eaves wall into a partition. Ignoring lower
  walls within 0.1 m fixed it.
- **A wall the roof closes is read again near its top.** A dormer's front
  wall can stand on the attic floor and rise through the roof. If its rays
  are open half a metre below its top, it stays exterior.

## On 17 public models

Fifteen of the 17 models we test on have no sloped roof crossing a wall's
ray height, and nothing in them moves. In the other two, 67 of 4,832 walls
moved from exterior to interior, 66 of them in schependomlaan, a Dutch
housing model whose author set the IsExternal flag on every wall:

- its 22 knee walls, plus 30 partitions and lift-shaft walls under the
  roof, all flagged interior by the author, now agree with the flag;
- across the model, flag and geometry now agree on 853 of 922 walls, up from
  815, and interior-flagged walls the geometry read as exterior went from 53
  to 1.

It also made 14 new disagreements, and they are worth looking at. Six are
insulated timber-frame panels (Rc 3.67) on the top floor, standing wholly
under the roof. When we cast their rays by hand, the roof's underside was
still 0.46 m further out at the panels' tops. They divide the heated rooms
from the cold space under the roof. Thermally they are envelope; by the
geometry they are inside the roof. Where they belong in a cost plan is an
estimator's call, not ours. The author's flag is kept, so they stay in B2010,
and each row tells you the geometry disagrees.

In the Uniformat grouping only one wall changes code, because the takeoff
only overrules a flag when a model sets it the same on every wall. What
changes for an estimator using flagged models is the "check it" note: 52
wrong ones gone and 14 new ones, all on walls a person would argue about.

The whole run, every moved wall and the limits (one building carries
almost the whole result, and nobody who prices buildings has checked it) are
in
[`eval/roof-blockers-2026-11-21.md`](../../ventures/ifc-quantity-takeoff/eval/roof-blockers-2026-11-21.md).
The takeoff runs in your browser and the model never leaves it. Try it on
your own IFC at
[marisstella.app/ifc-quantity-takeoff](https://marisstella.app/ifc-quantity-takeoff/).
