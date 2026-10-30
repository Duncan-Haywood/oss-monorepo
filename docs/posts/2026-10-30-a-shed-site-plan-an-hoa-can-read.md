---
title: "A shed site plan an HOA can read: which way it faces, north, and the easement"
date: 2026-10-30
tags: [shed-designer, hoa, site-plan]
description: "The shed designer's site plan can now turn the shed, point north and draw an easement, and the HOA packet shows the corner with the door."
---

An HOA's architectural committee wants to know two things about a backyard shed: what it looks like and where it goes. The [shed designer's](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) HOA packet already drew all four sides with dimensions. Its site plan had three gaps. Its own note told you to fill them in by hand: "Add a north arrow, the street name and any easements before you submit it." This round closes two of them and fixes a third problem the old plan didn't mention.

**The shed could only face the street.** The site plan placed every shed with its door wall toward the street. Many people want the door facing the house or the side yard instead. A new "Door wall faces" setting gives the street, the left, right or rear lot line. A quarter turn is more than a picture change: the eaves move with the long walls. On a default 8x12 turned to face the left lot line, the 8" eave now overhangs toward the side lot lines. So a shed 6 ft from the left line is 5' 4" from it at the eave. The setback warning now checks the eave on all four sides, not just front and back. Before, a turned shed would have passed a 6 ft side setback it doesn't meet.

**North.** A select sets north to any of eight directions, and the plan draws an arrow beyond the lot's corner. Eight directions is coarse. It's enough for a committee to orient the drawing, and a lot rarely needs more on a sheet that says it is not a survey.

**Easements.** Plats often show a utility or drainage easement along the rear or a side lot line, and most don't allow buildings in them. You can now type its side, width and the plat's own wording. The plan draws it as a dashed strip with your note. The tool warns when the shed or its eave reaches into it: 6 ft from the rear line inside a 10 ft easement is flagged, and 12 ft is not.

The street name stays a blank to fill in, as does the owner's address on the cover sheet. The tool never asks for an address.

**In the packet.** The site page used to print the plan set's whole sheet, title block and all, inside the packet's own header and footer. It now prints the drawing alone, and the caption says what is still missing. The 3D view on the cover can be seen from any corner. By default it picks the corner that shows the door, so a shed with its door on the left side no longer shows the committee its blank right wall. The sample packets now cover the 11 gallery designs as well as the 8 starting ones. From the front-right corner they use the pictures the tool's build already drew, so the sample opens without drawing in WebGL.

**A bug the browser found.** The coloured elevations draw each shingle course as staggered tabs. A course starts up to a tab's width left of the rake, so the first tab could fall wholly outside the roof and be drawn with a negative width. Browsers log that as an SVG error on every packet. 18 such errors appeared on one page load. Those tabs are now skipped, and a test checks every rectangle in every preset's four elevations.
