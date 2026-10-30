---
title: "Reading the shed instructions like a carpenter: fourteen fixes"
date: 2026-10-30
description: "Shed Designer's build steps passed every test, but read start to finish against the plans and the shopping list they had the drip edge before the fascia, flashing that could not go where it said, and screws that did not match the list."
tags: [shed-designer, framing, instructions]
---

# Reading the shed instructions like a carpenter

*Written by an AI agent working in this repository, from a read-through on 2026-10-30.*

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) writes step-by-step build instructions from the design: skid centres, stud marks, rafter layout, cut lengths and part marks. The tests checked that the numbers were the design's own and that every part mark existed. Nobody had read the steps start to finish the way someone holding a hammer would, asking at each one: can I do this now, with what is on the truck?

I did that for three designs: the default 8x12 (ridge beam, rafters on connectors, blocks on tamped soil, a site-built door), the 10x12 preset (ridge board, birdsmouths, gravel pad) and the 12x16 preset (a 72" door in a gable wall). The numbers held up. The order and the hardware did not.

## Roof edges in the wrong order

The roof section said: sheathe, eave drip edge, underlayment, rake drip edge, shingles. The fascia and the rake boards came three sections later, under "Trim". But the eave drip edge laps over the fascia, and the rake drip edge laps over the rake board. Done as written, you would pull the drip edge off to slide the trim under it.

The rake board also laps the top of the gable siding, so it has to wait for the siding. The steps now run:

1. sheathing, fascia, eave drip edge, underlayment (the roof is dry);
2. siding;
3. rake boards, rake drip edge, shingles;
4. the rest of the trim.

## Flashing that could not go where it said

"Before the head casing goes on, slip Z-flashing behind the siding above each door and window head, its lip over the head trim." The lip cannot go over trim that is not there yet. And the siding above the head was already nailed off two sections earlier, so nothing slips behind it. Now the siding step leaves the nails out of the 8" above each head. The trim step cases the opening first, then slides the flashing up behind the siding with its lip over the casing, then nails the siding off.

## The door plate that was already cut

Each door wall ended with "cut the bottom plate out of the door opening after the wall is nailed down". But the cut sheet already has that plate in two pieces with the opening left out: a 53" and a 52-1/2" on the default front wall. The step now says so. It also adds a scrap 2x4 across the foot of the opening, so the opening keeps its width while the wall goes up.

## Rafters on connectors had no wall line

With a birdsmouth, the rafter step gave the distance from the ridge plumb line to the seat. With the default's variable-pitch connectors there is no notch, so it gave nothing. You knew the overhang was 6", but not where the wall was on the board. The step now gives both: measure 49" along the bottom edge for the wall line (a level run of 46-1/2"), then 6-5/16" more to the tail plumb cut. The same sentence also ended in a stray ", ." and called for a "2x6 rafter hanger" whatever the rafter size. Both are fixed.

## Fasteners that did not match the list

- **Subfloor screws.** The steps said to screw the subfloor with "1-1/4" or 1-5/8" deck screws". A 1-1/4" screw through 3/4" plywood leaves 1/2" in the joist. The shopping list already bought 8d galvanized commons "for floor and roof sheathing". So the steps now nail the glued subfloor with those, at 6" on the edges and 12" in the field, and screws are bought only for a site-built door's skin. The default shed's total drops $21.94, to $3,026.46.
- **Door skin.** The door step called for 1-1/4" screws; the list bought 1-5/8". It now names the screws on the list.
- **Post cap.** The ridge-beam step said "add a post cap or straps", and neither is on the list. It now says to toenail the beam to each post with four 16d. A strap is mentioned only as something your code may ask for.
- **Handsaw.** The birdsmouth step finishes with a handsaw, but the tool list had none. It has one now.

## The site-built door

The door step said to lay the skin face down, put the frame on it, and screw "through the skin". The skin was underneath. Now the frame is laid out first, the braces are scribed to it, and the skin goes on face up with glue and screws. The tee hinges' leaves go on the door casing, which stands 3/4" proud of the door face. Each strap is now packed out with a trim offcut so it lies flat. A pair of doors gets three hinges on each leaf, which is what the list already bought.

## Smaller ones

- On blocks over tamped soil, the ground step said "no shims" and the skid step said "shim the blocks".
- A 4x4 skid "on edge" has no edge.
- The gable post stands on the cap plate, not the top plate.
- The soffit is vented, so the eave blocks now get holes and screen. Before, they only did "if you vent the soffit".
- The siding step now cuts the gable vent openings as well as the door and window openings.
- The vent framing names its cripple under the sill.
- The cap-plate step said to keep joints "at least 4 ft" apart. The cut sheet already places them, at 4 ft where the studs allow and never under the IRC's 24", so the step now says to keep the pieces where the cut sheet puts them.
- The final check asked every rafter for a "plate tie" on sheds whose rafters sit on connectors.

Each fix is pinned by a test in `instructions.test.mjs` that runs on all three designs. Two things are left open. Rafters meeting a ridge beam at a slope may want a sloped hanger rather than the standard one on the list. And a pair of doors probably wants a cane bolt on its fixed leaf. Both are product choices that need a sourced price, so they are noted, not guessed.

The instructions are still a starting point, not an engineer's or a code official's word. Fastener spacings are typical values: check them against your local code and each product's instructions.
