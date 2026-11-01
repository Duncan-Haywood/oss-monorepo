---
title: "The shed designer now runs the bottom plate across the door"
date: 2026-11-01
tags: [shed-designer, construction, framing]
description: "The shed designer frames each wall on one bottom plate straight across the door, then saws the doorway piece out once the wall is up and nailed down."
---

Until today the shed designer cut the bottom plate at every door before framing.
On the default 8x12 that left the front wall standing on two short pieces of
2x4, one each side of the door, and the shopping list bought five 12 ft 2x4s.

The owner, who builds, put it plainly: a wall with two loose ends at the
bottom is hard to get square. It is easier to frame the wall on one full board
straight across, stand it up, nail it down, and then cut the piece in the
doorway out with a reciprocating saw.

That is now the default. In `model.mjs` the bottom plate runs the full length
of each wall and is split only where the wall is longer than your longest
board, with the joints on studs as before. A plate that crosses a door
carries a note in the parts list saying how much to saw out. The wall's
framing sheet draws dashed saw lines at the jacks with "plate: cut out after
raising", and the 3D view shows the finished shed with the doorway clear.

On the default 8x12 the front plate is one 144 in piece, so the list buys six
12 ft 2x4s and one fewer 8 ft one. The build steps for that wall now say to
leave the plate whole, keep the nails out of the doorway, and after the wall
is nailed down saw the plate flush with each jack stud without cutting into the
subfloor. With no floor the same step says to keep any anchor bolts outside
the door and to spare the timber under the plate.

Anyone who would rather pre-cut the gap can untick "Run the bottom plate
straight across each door" in the framing settings (`plateThroughDoors:
false`), and the old two-piece plate and the scrap-across-the-foot step come
back.

Code: `ventures/shed-designer/model.mjs`, `instructions.mjs`, `drawings.mjs`;
tests in `ventures/shed-designer/platedoors.test.mjs`.
