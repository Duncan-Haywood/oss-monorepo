---
title: "Start here: plan a backyard shed board by board with the Shed Designer"
seo_title: "Start here: Shed Designer, free shed plans, cut list and cost"
date: 2026-10-30
tags: [start-here, shed-designer, construction, diy]
description: "For homeowners, DIY builders and small builders: what the free Shed Designer produces, a first ten minutes with it, and the limits of its checks."
---

# Start here: plan a backyard shed board by board with the Shed Designer

This guide is for people about to build a shed, or about to price one. A homeowner who wants somewhere for the mower and has never framed a wall. A confident DIY builder who knows how to frame but dreads the evening with a tape and a spreadsheet. A small builder or handyman who quotes a few sheds a year and wants a materials list they can stand behind. And anyone with an HOA that wants drawings before anything goes up.

The [Shed Designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) is a free tool that runs in your browser. You drag out the shed you want, and it frames every board at its real size, then gives you drawings, a 3D model, a cut sheet and a priced shopping list for that exact shed.

## The problem, in your words

"The plans I found are 8x10 and I want 8x12." "How many 2x4s is that, really?" "The kit looks cheap until you notice it has no floor and no shingles." "My HOA wants elevations with the colours on them." "Can I keep it under 100 square feet so I don't need a permit?"

A fixed plan set is drawn for somebody else's size. Change one dimension and every cut length, board count and sheet of plywood changes with it. Doing that by hand is slow and easy to get wrong. The tool redoes all of it every time you move a wall.

## What you get

- **Three roof shapes.** A gable, a lean-to (one slope) or a gambrel barn roof, with a ridge board, a ridge beam or site-built trusses on the gable.
- **True lumber sizes.** A 2x4 is framed at 1-1/2" x 3-1/2", a 2x6 at 5-1/2", and so on, so the lengths on the cut sheet are lengths you can cut.
- **A cut sheet.** Every piece is assigned to a board of a length you can buy, at prices you can change. Beside its cost the tool shows a proven lower bound, the cheapest any cutting plan could do. Over 217 cut lists from the presets and their options, the README reports the orders came out 0.35% above that bound in all.
- **A shopping list with a cost**, priced at Home Depot and at Lowe's separately, with a link per line, a subtotal per section, and a "Leave out" box for anything you already own.
- **Plans.** A foundation plan, floor framing, four wall framing elevations, a roof framing plan, a building section and a cutting layout of every 4x8 sheet the list buys. Print them, or download SVG or DXF.
- **An HOA packet**: coloured elevations with heights, pitch and every door and window dimensioned, a summary page and, if you type your lot and setbacks, a site plan with each clearance.
- **Build steps** written for your design, with cut lengths, rafter angles and part marks.
- **A structure tab.** A screening check of joists, rafters, studs, headers, posts and the soil under each block, with each member's use of its capacity written out.
- **Searches for savings.** "Find a cheaper build" looks for stock doors, windows, siding, floor and foundation choices that save money on the same footprint, and lists each saving. "Find a simpler build" looks for fewer, simpler saw cuts. Choices you fix are left alone.
- **Ready designs.** The page opens with a gallery of sheds under 100 sq ft, picked from a design search in which every design was framed, priced and checked.

## Your first ten minutes

1. **Open the tool** at [its live page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/). It works on a phone, but a laptop is easier for dragging.
2. **Browse the ready designs.** Tap a card ("See all sides, cost and storage →") to see renders from three sides, the price with a breakdown, the footprint, peak height and how much the shed holds. Add two or three to "Compare" if you are torn.
3. **Press "Start from this design"** on the one closest to what you want. It opens a copy in the editor.
4. **Drag it to your size.** On the plan view, drag a corner or an edge; it moves in 6" steps. On the end view, drag the peak for the pitch and the wall top for the height. Every number is also a field you can type, and "Undo" works.
5. **Place doors and windows** with "Add door" and "Add window", then slide them along a wall.
6. **Read the "Shopping list".** Tick "Leave out" on anything you already have. Then open "Cut sheet" to see which board each piece comes out of.
7. **Open "Structure"** and look for anything flagged. If a member is near its limit, the tab says which and why.
8. **Try "Find a cheaper build"** and read what each change would cost you in looks or height before you accept it.
9. **Open "Plans"** and, if you have an HOA, "HOA packet (PDF)". Use "Copy link" to save the design; the whole design travels inside the link.

## If you build for a living

A small builder will care about two things. First, the cut sheet and shopping list are generated from the same model as the drawings, and the tests check that every member bears on what is under it and every sheet joint lands on framing. Second, the prices are a starting point, not your supplier's: they are store listings read on 2026-10-29, mostly from search results, and they move. Type your own prices in and the cut sheet re-optimises at them. For a feel of the numbers, the README's worked default (an 8x12 with a 6'6" door and two small windows) comes to $3,218.65 before sales tax at those starting prices, from 151 pieces cut from 91 boards.

The engine is plain JavaScript with no dependencies, so it also runs from code. `ventures/shed-designer/llms.txt` lists the functions, such as `buildShed(design)` and `estimate(shed, prices)`. To run the page locally, serve the folder with `python3 -m http.server` and open `http://localhost:8000/`; the tests run with `node --test` on Node 22.

## Cost and data

The tool is free and MIT licensed. Your designs are never uploaded. They are kept in your browser's local storage so they are there next time, and a footer checkbox turns that off and deletes them. Anonymous counts of which features get used stay on your device; a second checkbox stops them, and Do Not Track and Global Privacy Control are honoured. A shared link carries the design after the `#`, which browsers do not send to the server. Hosting is best effort, so save your design to a file if it matters.

## What it does not do

- **It is not engineering, building-code or legal advice.** The structural check is a screening check, not a code review. A building department, or a designer who can stamp drawings, decides what is allowed.
- **It does not make a set "permit-ready".** What a submission needs is set locally. The Plans tab notes that many places need no permit for a small shed, and that zoning and HOA rules can still apply. Check with your town.
- **The site plan draws what you type.** It is not a survey.
- **Some shapes are out of scope:** hip and saltbox roofs, porches, ramps and slabs.
- **Prices can be stale.** Both stores block automated reads, so listings come from search-result copies.
- **No one has built a shed from it yet.** It is checked by hand-counted unit tests and by driving the page in a headless browser.

## How to get involved

The most useful thing a builder can send is a field report: you built from its cut sheet, and here is where the count, a length or the build order was off. A homeowner who notices a confusing label, a wrong price on a line, or an HOA that asked for something the packet lacks, can say so too. Small builders: tell us which local prices or materials you would need for it to be useful in a quote.

Send ideas through the [feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) and faults through the [bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). An idea is weighed, with no promise it gets built. Pull requests from forks are reviewed by the maintainer by hand; the repository's AI agents never act on them.

## Where to go next

- Everything the tool does, and how each number is computed: `ventures/shed-designer/README.md`
- How the ten ready designs were picked: [Ten sheds under 100 sq ft](2026-10-30-ten-sheds-under-100-square-feet.md)
- Whether designing your own beats a kit: [Is a shed you design yourself a better deal than a kit?](2026-10-30-is-a-designed-shed-a-better-deal-than-a-kit.md)
- What changed after a first visitor's walk-through: [A first visit to the shed designer](2026-10-30-a-first-visit-to-the-shed-designer.md)
- For framers who want a wall takeoff for a house: [Start here: Wall Framing Takeoff](2026-10-29-start-here-wall-framing-takeoff.md)
- More tools for building trades: [Start here: free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
