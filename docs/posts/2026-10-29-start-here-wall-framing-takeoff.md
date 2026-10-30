---
title: "Start here: Wall Framing Takeoff, a lumber order and cut list from your wall list"
seo_title: "Wall Framing Takeoff: a lumber order and cut list from walls"
date: 2026-10-29
tags: [start-here, wall-framing-takeoff, construction, framing, estimating]
description: "For framers, estimators and owner-builders: what the free framing takeoff gives you, how to run your first house in ten minutes, and what it leaves to you."
---

# Start here: Wall Framing Takeoff

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these tools.*

## Who this is for

You frame houses, you price them, or you are building one yourself. Maybe you
run a small framing crew and the estimate is still a sheet of paper with "one
stud per foot, plus ten percent" at the top. Maybe you are an estimator who
wants a number you can defend line by line. Maybe you are an owner-builder with
a set of plans, a lumberyard account and no idea how many 2x6 x 16s to ask for.

Wall Framing Takeoff is for all three. You describe the walls, doors and
windows of a US stick-built house, and it lays out every stud and tells you
what to buy.

## The problem, as you would put it

"I don't want to lay out every wall by hand just to get a lumber count, but the
allowance always leaves me either short on the last day or with a pile of
boards I paid for and didn't use."

Laying out a house by hand takes hours, so most people don't. They use a rule
of thumb, add waste, and hope. The rule of thumb does not know that a wide
window replaces three layout studs with kings, jacks, a header and cripples, or
that a 28 ft wall needs a plate splice that lands on a stud.

## What you get

- **A real count instead of an allowance.** Every king, jack, header, rough
  sill and cripple, placed at 16, 19.2 or 24 inches on center, with corner and
  tee backing.
- **A lumber order you can hand to the yard.** The tool works out the cheapest
  mix of board lengths from the lengths and prices you type in, counts the saw
  kerf on every cut, and shows a lower bound so you can see how close the order
  is to the cheapest one possible. On the invented example house the gap was
  under a hundredth of a percent.
- **A cut list and layout marks your crew can work from**, plus a printable
  elevation drawing for each wall (HTML or PDF) with every member marked.
- **A check on its own work.** After layout, every wall is tested: members
  inside the wall, no two in the same space, every rough opening clear, a
  header over every opening, every plate joint over a full stud. The page shows
  the result per wall.
- **Optional extras when you want them**: wall sheathing, a floor frame, a
  gable or hip roof, stairs, drywall, insulation, siding, trim, nails, a budget
  from your own prices, a build schedule and a way to line up subcontractor
  bids on the same scope. Each is a tick box or card on the page; leave them
  off and the tool stays a framing takeoff.

The README has a measured comparison against two common rules of thumb. On the
invented example house, the per-foot allowance asked for 7.7% more lineal feet
than the counted order; on a generated open-data plan, 1.9% more. Those are
invented and generated houses, not permit sets, so treat the figures as a
sketch of how the rules behave, not a promise about your job.

## Your first ten minutes

1. **Open the tool** at
   [its live page](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/).
   It opens on an invented example house so you can see a finished takeoff
   before typing anything. "Load the example house" brings it back later;
   "Start empty" clears it.
2. **Section 1, Wall settings.** Pick the stud spacing and wall height you
   frame to.
3. **Section 2, Walls.** Use "Add a wall" for each wall and type its name and
   length. Lengths can be written the way you would say them: `40'`, `13' 3"`,
   `92-5/8`. A bare number is inches. Tick "Corner at start" where walls meet,
   and mark interior walls as partitions. If you would rather draw, open "Draw
   the plan instead of typing it", sketch the walls on the grid, place doors and
   windows, and press "Use this sketch" to fill the tables. You can also trace
   over a photo or scan of your plan.
4. **Section 3, Doors and windows.** "Add a door or window" for each opening:
   which wall, how far from the wall's start, the rough opening width and
   height, and the header size you intend to use.
5. **Section 4, Lumber you can buy.** Replace the default lengths and prices
   with your lumberyard's. Until you do, every board costs one unit per foot,
   so the order saves length, not dollars.
6. **Press "Run the takeoff."** Read the lumber order, the cut list and the
   per-wall check. If a wall fails, the message says why.
7. **Take it with you.** "Download CSV" for the order and cut list, "Download
   wall drawings (printable)" or "(PDF)" for the shop sheets, and "Save plan
   file" so you can reopen the job later with "Open plan file". That button
   also reads an ASCII DXF floor plan.

If you work from a terminal, the same engine runs as a Node command with no
install: `node cli.mjs --example > plan.json`, edit the file, then
`node cli.mjs plan.json`. The README lists the flags.

## What it costs and where your plan goes

It is free and MIT licensed. The page runs in your browser and does not upload
your plan. There are no accounts and no analytics vendor. It keeps your last
plan in your browser's local storage so it is there when you come back, and it
counts a few anonymous events (such as "takeoff run") in that same local
storage only; a switch in the footer turns the counting off. Hosting is best
effort with no uptime promise, so save your plan file.

## What it does not do

This matters more than the feature list.

- **It is not engineering.** Header sizes, ply counts, jack counts, stud size
  and spacing are your inputs. Nothing checks them against a span table, a load
  or a building code. You can paste in your own span table and the tool will
  flag a header lighter than your table asks for, but the table is yours. A
  qualified person, your engineer or your local building department decides
  what the plan must be, and you should have them check it before you build.
- **It is not finished.** Multiple storeys, let-in or structural bracing, and
  walls that change height are not modelled. An opening too close to a wall end
  for its kings and jacks is refused rather than framed; frame that end by
  hand. Window and door sizes are rough openings, not unit sizes.
- **It has not met a real builder's plan set yet.** The layout was checked on
  hand-counted walls, 400 seeded random walls and the invented example house.
  The DXF reader was built on hand-made drawings. Many of the extra trades
  (stairs, drywall, siding, foundation) are checked against hand arithmetic
  only. Read every length before you cut.
- **No price is stated or implied.** Costs come only from numbers you type.

If you need a full commercial estimate with trusses and supplier pricing, a
commercial takeoff package is the more complete tool.

## Where to go next

- The live tool:
  [wall-framing-takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/)
- The guide behind the count:
  [How many studs do you need for a wall?](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/how-many-studs-for-a-wall.html)
- Every feature, how it was tested and its limits:
  `ventures/wall-framing-takeoff/README.md` in the repository. The longer plan
  to automate more of new-home construction is
  `ventures/wall-framing-takeoff/ROADMAP.md`.
- Other free tools for builders and tradespeople:
  [free tools for your trade](2026-10-29-start-here-free-tools-for-your-trade.md).
  Keeping the books for a small crew:
  [the bookkeeper](2026-10-29-start-here-ai-bookkeeper.md). Calling the engine
  from an AI assistant:
  [AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md).
- Back to the series hub: [Start here](2026-10-29-start-here.md).

*No warranty. This is not engineering, construction, code, legal or financial
advice. You are responsible for checking the output before you rely on it.*
