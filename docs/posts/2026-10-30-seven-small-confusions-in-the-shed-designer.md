---
title: "Seven small confusions in the shed designer, and what fixed them"
date: 2026-10-30
tags: [shed-designer, ux, testing]
description: "A cleared box that meant 0, a site-built door that quietly stopped being site-built, a price that fell as walls rose, and four more, each with a browser test."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) frames a gable shed board by board and prices it. Its maths is well tested. This round looked at the places where a person using it could be misled, even though the numbers underneath were right. Each fix below comes with a test that drives the page in headless Chromium, and each test failed before its fix.

**A cleared box meant zero.** The form read `Number(field.value)`, and `Number('')` is 0. So if you cleared the wall height and tabbed away, the tool built a 0" wall, which the model then clamped to 60". If you cleared an opening's width, it built a 0" opening. A blank or junk number box now keeps the design's last value, and leaving the box puts that value back. No rebuild happens and no undo step is added.

**A site-built door stopped being site-built.** The door option "build it on site" makes a Z-frame door out of the siding that was cut from the opening. It works at any size, and the option says so. But typing a new width or height switched the door to "Custom size", which takes its frame off the cut sheet and its cost out of the total. We found this while writing the next fix. A new size now keeps a site-built door; only catalogue units go custom.

**A Z brace at 1 degree.** A 12"-tall site-built door was accepted without comment. The rails take up nearly the whole height, so the brace lies almost flat at about 1 degree and does nothing to stop sag. The tool now warns when the brace runs under 25 or over 65 degrees. The starting 38-1/2 x 78 door is 47 degrees, a 60" pair is 56, a 20 x 78 leaf is 70 and a 36 x 36 one is 24.

**The price fell as the walls rose.** On the 8x8 preset, 112" walls come to $2,911.31 and 114" walls to $2,880.00. That is correct. Each 4 ft column of T1-11 takes the shortest panel that reaches its top: a 4x8 at $46.78, a 4x9 at $52.63 or a 4x10 at $58.48. Once a column needs more than 10 ft, it takes a 4x8 with a strip cut from another 4x8 above it, and on that design the strips cost less than the 4x10s did. The summary now explains this with the panel prices and the column counts, so a dip doesn't look like a bug.

**Undo forgot without saying.** Each design has its own undo history, and switching designs clears it. That is deliberate, but the page never said so. It now says so in the status line whenever a switch throws history away, and in the Undo button's tooltip.

**Custom-size doors and windows had no price at all.** They are still left out of the total, because no listing matches an odd size. Each one now shows a typical range from the tool's own catalogue. A single door is $246.00 to $615.00 across 5 units; a double door over 44" wide is $465.00 to $585.00 across 2; a window is $47.75 to $86.45 across 8. A box counts each one at the median of its range. The line is called a range and marked "estimate", and it links no listing.

**On a phone the price was out of sight.** On a Pixel 7-size screen the cost panel starts about 1,340 px below the plan, a screen and a half away. You could drag the shed bigger and never see the price move. A sticky bar at the top of the page now carries the total, plus links to every results tab. A first version put the total in a pill in the bottom corner, but on a phone that pill could sit over a door in the plan, and the door-drag test caught it in CI. On a laptop, the plan and end-view boxes no longer stretch to the height of the 3D column, which used to push the end view below the fold.

Two changes under the hood. A steep drag of the roof peak now grows the end view as you drag, instead of rescaling when you let go. The 3D view now measures its dimension labels once per redraw of the model instead of on every frame: one orbit used to take 74 layout reads for 18 labels, and now takes at most 18.

The tool is a planning aid, not engineered or code-checked plans. A building department decides what is allowed.
