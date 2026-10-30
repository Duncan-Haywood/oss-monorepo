---
title: "When the wind turns a shed truss inside out"
date: 2026-10-30
tags: [shed-designer, wind, structure, trusses]
description: "Under enough wind uplift a site-built truss's bottom chord stops pulling and starts pushing. An unbraced 8 ft 2x4 chord is too slender for that, so the shed designer now adds an $8 brace when the wind you set calls for it."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) can frame a shed's roof with site-built trusses: two top chords, a bottom chord and OSB gussets nailed on both faces. Until now every check on those trusses was a gravity check. Snow and the roof's own weight push the heels apart, the bottom chord is in tension, and the heel gussets are nailed for that pull.

Wind does the opposite. Take the allowable-stress combination 0.6D + 0.6W on one truss's 2 ft strip of an 8 ft wide, 4/12 roof:

- **At 20 psf** (the tool's default), 0.6 x 20 = 12 psf of uplift is less than 0.6 of the 15 psf roof plus the 5 psf of ceiling dead load. Nothing reverses, and the new row reads zero.
- **At 40 psf**, the net is 23 lb per foot upward. That pulls the heels together with H = wL^2/8h = 138 lb. The bottom chord is now a column.

The heel's six 1-1/2" gusset nails hold that easily: 129 lb each at the wind's load-duration factor of 1.6, so the nails sit at 18%. The chord is the problem. An 8 ft 2x4 with no king post is braced only at its ends, so about its thin axis its slenderness is 96 / 1.5 = 64. NDS 3.7.1.4 caps a compression member at 50, whatever the load. So from about 21 psf on this roof, the point where the uplift first outweighs the roof, an unbraced chord fails.

The fix is one board. When the wind you set reverses the chords and there is no king post already halving them, the designer now lays a 2x4 flat across the tops of the bottom chords at mid-span, from one gable-end pair to the other, and draws it, lists it and adds it to the build steps. The chord's slenderness drops to 32 and the new "Truss heels (uplift)" row passes: at 40 psf it reads 18%, set by the nails. On the default 8x12 truss shed the brace costs $8.46. At the default 20 psf nothing reverses, so nothing is added and no price moves. An attic deck nailed to the chords braces them on its own, so a shed with attic storage gets no extra brace.

**A tie that was the wrong part.** Writing this check turned up a second error. The uplift row for the rafter ties picked its tie from the `rafterSeat` setting, which is "connector" by default. A truss has no connector seat: the estimate buys a Simpson H2.5A hurricane tie for each heel. So trusses were being checked against a VPA2's 220 lb when the shed is built with a 615 lb tie. The row now follows the part the shopping list buys, and it counts the ceiling's weight as holding the heel down. The default truss shed's tie drops from 18% to 2.5% at 20 psf.

**The siding step named the wrong siding.** The build instructions' Siding step began "T1-11 panels" whatever siding you had picked. LP SmartSide panels now get their own name. Board-and-batten and vinyl get a step that starts with the OSB sheathing they need under them, because on those designs that sheathing is what braces the walls.

None of this makes the tool an engineer. It is a screening check of the kind a span table encodes, and the shed's plans still say they are not engineered or code-checked.
