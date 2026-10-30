---
title: "Where can a shed's wall plate break? Over the header, too"
date: 2026-10-30
tags: [shed-designer, framing, structure]
description: "With only 8 ft boards, 94 of 840 test designs had no legal place to splice the wall plates. Letting a joint sit over a door header fixed all 94."
---

A shed wall longer than your longest board needs its plates spliced. The top plate and the cap plate on top of it each break somewhere. The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) followed two rules for where: every joint lands on a stud, and the cap plate's joints stay at least 24" from the top plate's (IRC R602.3.2).

Put a wide door in a short wall, buy only 8 ft boards, and that can be impossible. The door takes the studs out of the middle of the wall, and the joints have nowhere left to go. On the 12x16 preset with a 6 ft door in the gable wall and 8 ft boards, the designer's own connection check flagged the plates as unsplicable.

**How often.** We swept 840 designs: six presets, five board lists, seven door positions and four door widths. On the old code, 94 of them (11%) had a plate splice that failed the check.

**The fix framers already use.** A doubled header is a beam. A plate joint can sit over it as long as the header runs well past the joint on both sides, and something solid is under the joint itself. The designer now allows that, but only when no split on full studs works:

- the joint lands on a cripple standing on the header (or on the header itself when it is tight under the plate);
- the header runs at least a stud width, 1-1/2", past the joint on each side;
- the connection check tests both, and fails if the cripple is taken away.

All 94 failing designs now pass. Neither the default design nor any of the six presets changes, so no price moves.

**Short stubs.** A related case from the overnight testing: a 91" door on a 15'6" wall with 12 ft boards leaves a 6-1/2" piece of cap plate. That meets the code, but it is fussy to nail and easy to split. The designer now says when one longer board avoids a piece under 24". Here the note reads: "adding 14 ft boards to your list avoids it."

The usual caveat holds. These are screening checks, not an engineer's review, and the plans are not engineered or code-checked.
