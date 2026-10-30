---
title: "A first visit to the shed designer, on a laptop and a phone"
date: 2026-10-30
tags: [shed-designer, ux]
description: "A first visitor's path through the shed designer on a laptop and a phone, from gallery to HOA packet to print, and the eight confusions we fixed."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) has had about a hundred changes in two days. That is good for depth and bad for someone opening it for the first time, so we walked one visitor's path on a 1366 x 900 laptop screen and a 390 x 844 phone: open the gallery, pick a design in painted lap siding and shingles, leave some items out of the total, read the cut sheet, open the HOA packet and print. These are the places where we stopped and wondered what was going on.

**The gallery miscounted itself.** The text said "Ten sheds… six in painted lap siding", and the strip said "1 of 11". There are eleven designs and seven of them are lap-sided. The text had been written by hand and the gallery has grown since. The page now counts the designs from the list it shows.

**Nothing on a card said it opens.** The only button on a card read "Compare", and the card itself is the button that opens the detail. Each card now ends with "See all sides, cost and storage →".

**On a phone, the explanation came before the sheds.** Nine lines of how the designs were picked pushed the first card below the fold. That text is now behind "How these were picked", with one sentence left on show.

**The price jumped by $249.** The card and its detail said $3,307, and after "Start from this design" the bar at the top said "Total $3,556.16". Both are right: the gallery prices the materials before tax, and the bar adds tax and delivery. The detail even said so in small print. The bar now says "Total incl. tax + delivery", so the difference explains itself.

**On a phone, "Leave out" was off the screen.** The shopping list is an eight-column table, and on a phone the "Have it" and "Leave out" boxes sat past a sideways scroll that nothing pointed to. Below 600 px each line now becomes a small card: the item, the quantity, the price each and the total, its source, and the two boxes underneath.

**The HOA packet was hard to find.** It was the third button inside the Plans tab. For the owner whose shed this tool is built around, the packet is half the point. It is now in the sticky bar at the top, next to "Print all".

**Printing printed the screen.** "Print all" came to 44 pages, with "Show in 3D" on every cut-sheet board, two empty tick-box columns, the store comparison table and a blank quote-request form with "Needed by: e.g. 15 November". Those are hidden in print now, which brings it to 40 pages, all of them plans, lists and steps.

**The 3D hint was out of date.** Since this round's cross-reference work, a click on the siding or the roof names the panel and the shopping lines that buy it, so the hint no longer says only "click a board".

Some things were fine and we left them alone. The phone layout had no sideways scroll anywhere else. The HOA packet's own site-plan page says plainly what to type and where when no lot is set, and it offers a space to sketch until you do.

The tool is free and runs in your browser. Its structural checks are a screening aid, not engineering or a code review.
