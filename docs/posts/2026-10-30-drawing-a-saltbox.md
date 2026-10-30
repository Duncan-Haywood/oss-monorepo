---
title: "Drawing a saltbox: every sheet that assumed a centred ridge"
date: 2026-10-30
tags: [shed-designer, drawings, saltbox]
description: "The saltbox joins the shed designer's New design menu. The plan sheets, 3D view, editor, build steps and HOA packet now put the ridge where it really is."
---

Earlier today the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)'s engine learned to frame a saltbox: a gable with its ridge off centre, a short steep front and a long shallow back. The preset stayed out of the New design menu because everything that draws a shed still put the ridge at mid-width. It is in the menu now, as "8x12 saltbox", and the Shape box has a Saltbox option with its own front-slope field.

**What had to change.** Searching the code for "half the width" found each place a drawing assumed a symmetric roof:

- **Wall framing.** The gable-end elevation now draws the end rafter's line from each eave up to the off-centre ridge, with a dimension to the ridge from the front wall.
- **Roof plan.** The ridge board sits where it is, rafters on each side stop at its faces, and the note gives both cut lengths.
- **Building section.** Two pitch marks, one per slope. The sheathing on each slope is drawn at its own thickness on plumb, and the note gives a birdsmouth heel for each side.
- **Exterior elevations.** The gable ends peak over the ridge, and the eave sides are labelled "steep side" and "long slope".
- **Rafter details.** A saltbox gets two: the steep front rafter and the long back one, each with its own plumb cuts, seat and cut length.
- **Sheathing layout.** The two slopes are laid out with their own lengths.
- **The end-view editor.** The peak handle sits over the ridge, left of centre. Dragging it, or pressing an arrow key, moves both pitches together, keeping their ratio, so the ridge stays put.
- **Build steps.** Two rafter patterns, each laid out from its own pitch and run. The ridge board is propped with its centre measured from the front wall, not centred, with a note that the long rafters stand a little proud of it.
- **HOA packet.** The elevations draw both slopes and say "saltbox: 10/12 front slope, 5/12 back slope". The roof plan puts the ridge where it is.

**One fix on the way.** The HOA packet's roof plan drew a ridge and two slopes on a lean-to, which has neither. It now says "one slope, down from the front to the back".

**How I checked it.** I drew 48 gable, lean-to and barn designs with the code from before and after the change, and the SVG of every sheet is byte-identical. Their build steps are identical too, and so are the HOA packets of the gable and barn presets; the lean-to's roof plan is the one intended change. A browser test opens the saltbox preset and checks four things: the front-slope field shows, the peak handle sits left of mid-width, an arrow key takes 10/12 and 5/12 to 12/12 and 6/12, and switching to a gable hides the field. I also read the section, a gable-end framing sheet, both rafter details, the elevations, the HOA packet and the 3D picture by eye.

The preset costs about $27 more than a 6/12 gable of the same finishes, for about the same storage. It is a looks choice, so it belongs in a design tool. As always, the drawings are for planning: not engineered or code-checked, and not a permit set.
