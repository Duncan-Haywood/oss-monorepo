---
title: "What one walkthrough asked of the shed designer, and the answers it now gives"
date: 2026-10-30
tags: [shed-designer, ux, cost]
description: "Which board is the 14 footer for? What does a window really cost? Why do two options cost the same? The shed designer now answers these on the page."
---

The owner of this project walked through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) with a real budget in mind: about $2,000 against a starting total of about $3,500. The questions they asked were good ones, and the page couldn't answer them. These are the answers it gives now, using the starting 8x12 at today's prices ($3,026.46 of materials, $3,254.35 with sales tax).

**"What are the 14 and 16 ft boards for on an 8 ft shed?"** Each lumber line now says what it is for. The 16 ft treated 2x6 is for floor joist x 10. The 16 ft 2x6 is for rafter x 12, eave blocking x 8 and header x 4. The 14 ft 2x4 is for the top, cap and bottom plates and two gable studs. On the cut sheet, each board reads like "16 ft → 2 x 7' 9" floor joist (C)", so a long board that gets cut in half says so.

**"Where does this go?"** Every line of the shopping list, cut sheet and parts list now has a "Show in 3D" button. It lights its pieces up in orange in the 3D view, drawn over the siding and roofing so a stud behind a panel still shows. A box under the view names the pieces and links to the build step that uses them, the cut sheet and the parts list. It also works the other way: click a board in the 3D view and it says what it is ("Rafter, mark F").

**"What does a window really cost?"** Each door and window now has a "costs in all" figure: the shed's price with it, less the price without it, with the walls and roof held where they are. The first window is a $51.95 unit and comes to $79.67 in all: $13.13 of extra framing lumber, plus casing, trim boards and caulk. The site-built door comes to $124.23. We first priced it without holding the walls, and it came out at $204.99. The extra $81 was the walls dropping once the door that sets their height was gone, which is not what "what does this door cost" means. Panel siding is bought in whole sheets, so a small opening rarely saves one, and the figure doesn't pretend it does.

**"Can I take something off the list?"** A "Leave out" box sits beside "Have it" on every line. A line you tick stays on the list, struck through, so the plans and quote emails stay whole. It comes off the total, with its sales tax, and the total in the bar at the top updates too. Before this, "Have it" only changed a row at the foot of the table.

**"Is my labour in that number?"** No. The page now says so under the total: materials, sales tax and delivery only. Your own time is a separate line.

**"These two options cost about the same: what is different?"** Each option, and each saved design card, now lists what it changes and its price against the design you're editing. That includes the member counts, which name what a setting implies. "Ridge board with rafter ties" reads "+5 rafter tie, -4 post stud, -4 beam post" and $114.94 less. This turned up something the option's label never said: "Lower roof, 3/12" is $100.79 cheaper partly because the gable vents no longer fit and are left out ("-4 vent header"). The warning was on the page, but nobody comparing options would have connected it to the price.

**"Where are the plans?"** Shopping list, cut sheet, parts list, structure, plans and how-to-build were tabs in the middle of a long page. A sticky bar at the top now links to each one, and has a "Print all" that prints the list, the cut sheet, the plans and the build steps, each on its own page. The 3D view also pans now, with a right-drag, a Shift-drag, two fingers or Shift and the arrow keys. It stops before the shed leaves the picture.

All of it has browser tests that drive the page in headless Chromium, and an axe accessibility check runs on every results tab. The tool is a planning aid. Its plans are not engineered or code-checked, and a building department decides what is allowed.
