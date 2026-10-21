# New-home construction automation: roadmap

The owner, 2026-10-21: "I want to make tools that can automate part of the new
home construction process in the US, to drop prices and increase efficiency.
This is a long standing project to work on continually."

This file is the plan for that project. `wall-framing-takeoff` is its first
tool and the home of the shared house model; later tools may become their own
ventures but should read the same plan file. Each run that lands a milestone
ticks it here and rewrites the venture's `next:` in
[`portfolio/flagships.yaml`](../../portfolio/flagships.yaml).

## Why start with framing

Framing is the trade where a builder's own planning most directly sets the
material bill: every stud, header and plate is decided by a layout someone
draws, and lumber is bought by the board, in fixed lengths, before the walls
exist. The usual practice is an allowance (studs per foot of wall, plates by
the linear foot, a waste factor on top) because a full layout by hand takes
hours per house. Software that does the layout in seconds turns the allowance
into a count, and the count into an order, a cut list and later a panel
drawing a shop or a crew can build from. It also gives the later tools
(sheathing, blocking, schedule, estimate) a model of the house to work from.

What we will not claim: structural adequacy. Header sizes, spans and
connections stay the user's inputs or come from their engineer; ICC code
tables are not reproduced. Any later "check" reads a table the user supplies.

## Principles

- **One house model.** A JSON plan of walls, openings, and later floors and
  roof. Every tool reads it, so a builder types the house once.
- **Counts, not allowances.** Every quantity comes from a layout that can be
  drawn and self-checked.
- **Measured optimisation.** Every optimiser reports a lower bound or an exact
  check, and its README says how close it gets on seeded cases.
- **Runs in the browser, free, no account.** Same engine from the CLI and for
  AI agents.

## Milestones

Ticked items are on `main`.

### 1. Wall framing (this venture)

- [x] Stud layout, openings (kings, jacks, header, sill, cripples), corner and
      tee backing, plate splices over studs with cap/top joint offset, layout
      self-check, cut list, cutting-stock order with LP bound and exact small
      groups, page, CLI, agent engine (2026-10-21).
- [x] **Sheathing** (2026-10-21, `sheathing.mjs`): vertical panels per wall from
      the start end, every joint on framing that runs the panel's height (a
      nailer is called out where an opening leaves none), cut-outs at openings,
      the sheet length chosen from the wall height, and the sheet order as a
      cutting-stock problem over 48 in strips pooled across walls, with its LP
      bound. Two courses (blocked horizontal joint) for walls taller
      than the longest sheet landed 2026-10-21. Not yet: horizontal panel orientation, a 2D reuse of
      opening cut-outs, corner overhang and the rim board.
- [x] **Blocking and fire blocking** (2026-10-21, `blockingRows` in `engine.mjs`):
      plan `blocking: {rows, fire}` adds evenly spaced flat-2x rows between
      neighbouring full-height studs, skips openings, and `fire` adds enough
      rows that no stud run passes 10 ft; they join the cut list and order.
      The page has the controls (rows, fire blocking; 2026-10-21, saved in plan files). Not yet: staggered blocks, nailers for horizontal sheets.
- [x] **Corner plate laps** (2026-10-21, `plateLaps` in `engine.mjs`): top plate
      through one way, cap the other, piece lengths change, totals do not. Tee
      laps (2026-10-21, wall `tee: {wall, at, end}`): the partition's cap runs
      over the through wall's top plate and the through wall's cap is cut for it;
      page field "Butts into" landed 2026-10-21.
- [ ] **Advanced framing options** (2-stud corners, ladder blocking at tees,
      single top plate where framing stacks, right-sized headers from a
      user-supplied table) and a measured comparison on example houses.
- [ ] **Gable and rake walls**: sloped top plates, stud lengths per position.
- [ ] **Panel drawings**: per-wall shop drawings (SVG/PDF) a panel shop or a
      crew can build from, with the layout marks and the cut list per panel.

### 2. Getting the house in without typing

- [ ] A browser plan editor: draw walls on a grid, drop doors and windows,
      emit the plan JSON (corners and tees detected from geometry).
- [ ] Import from DXF floor plans (wall centre lines on a layer) and from IFC
      `IfcWall` / `IfcOpeningElement`, both parsed in the browser.

### 3. The rest of the shell

- [ ] Floor framing: joist layout on a user-chosen spacing and size, rim,
      blocking, subfloor sheet layout.
- [ ] Roof: rafter or truss count from a footprint and pitch (trusses as a
      purchased line), roof sheathing, underlayment and shingle squares.
- [ ] Foundation quantities: footing and slab concrete, rebar, forms.
- [ ] Interior: drywall sheet layout per wall and ceiling, insulation by
      cavity, trim.

### 4. Time and money

- [ ] Quantities x the builder's own unit prices -> a budget that ties every
      line to the model.
- [ ] A new-home schedule: critical path over the builder's own activity list
      and durations, crew levelling, and what a slipped inspection does to the
      finish date.
- [ ] Bid leveling against the model's quantities (siblings:
      `bid-leveling-worksheet`, `estimate-maker`).

### 5. Research threads

- [ ] How much does an optimised order save over the allowance methods
      builders use? Needs real plans (public permit sets or open house plans
      with a permissive licence) rather than our invented house.
- [ ] Advanced framing's material savings, measured on the same models with
      the same engine.
- [ ] Panelised vs stick framing: what the model can say about labour from the
      piece counts (cuts, members, nails) without inventing labour rates.
