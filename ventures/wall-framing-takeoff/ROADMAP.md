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
      than the longest sheet landed 2026-10-21. Horizontal panel orientation landed 2026-10-21 (courses, staggered end joints, blocked course joints). Corner overhang (`sheathing.overhang`, CLI `--overhang`, page tick box; the earlier wall's sheets run past its end by the next wall's depth; vertical sheets) landed 2026-10-21. Rim lap (`sheathing.rimLap`, CLI `--rim-lap=`, page field; vertical sheets) landed 2026-10-21. Cut-out reuse measured 2026-10-23
      (`cutout-reuse-bench.mjs`): on the sample house no panel fits a free-standing
      hole (vertical 0 of 38, 4 holes; horizontal 0 of 42, no interior holes), so
      there is nothing to build there; recheck on a real plan with large glazing.
- [x] **Blocking and fire blocking** (2026-10-21, `blockingRows` in `engine.mjs`):
      plan `blocking: {rows, fire}` adds evenly spaced flat-2x rows between
      neighbouring full-height studs, skips openings, and `fire` adds enough
      rows that no stud run passes 10 ft; they join the cut list and order.
      The page has the controls (rows, fire blocking; 2026-10-21, saved in plan files). Staggered blocks landed 2026-10-29 (`blocking.stagger`: alternate bays sit 1.5 in above and below the row line; fire-block rows allow for it; engine and plan files, not the page). Not yet: nailers for horizontal sheets.
- [x] **Corner plate laps** (2026-10-21, `plateLaps` in `engine.mjs`): top plate
      through one way, cap the other, piece lengths change, totals do not. Tee
      laps (2026-10-21, wall `tee: {wall, at, end}`): the partition's cap runs
      over the through wall's top plate and the through wall's cap is cut for it;
      page field "Butts into" landed 2026-10-21.
- [ ] **Advanced framing options.** Two-stud corners and ladder blocking at tees
      landed 2026-10-22 (plan `advanced`, page menu; measured on the example house:
      -4.5% order cost, README). Single top plate where framing stacks
      landed 2026-10-22 (`advanced.singleTopPlate`; no cap plate, tie count, -8.8% on the example house). Not yet: right-sized headers from a user-supplied table.
- [x] Deck framing (2026-10-30, `deck.mjs`, CLI `--deck`): joists, ledger or rims, dropped beam, posts, footings, decking rows, hardware count; hand-arithmetic tests, no real deck plan yet. Deck stairs landed 2026-10-30 (`deck.stairs` in the plan: `{width, tread, stringer, ...}`; total rise taken from the deck height; CLI only, hand-checked). Guard switch on the page card 2026-10-30. Picture-frame borders landed 2026-10-31 (`deck.border`, hand test). Deck stairs were already a page control (`dkStair`); the border select (`dkBorder`, 1 to 3 courses) landed 2026-10-31, source-asserted in `page.test.mjs` and click-checked in Chromium (16 x 12 ft deck, 1 course: 4 border boards).
- [x] **Gable walls** (2026-10-21, `layoutGable` in `engine.mjs`): wall `gable: {pitch}` (rise per 12 in), symmetric about the middle; studs cut to the long point of the angled cut, top and cap plates along the slope with joints over studs. Openings below the eave line landed 2026-10-21. Openings that rise into the triangle landed 2026-10-21 (header may top out above the eave line; cripples only where the roof clears it; a header that meets the slope at its lower end is rejected; engine and plan files, not the page). Sheathing the triangle landed 2026-10-22 (vertical sheets, own order). Not yet (the off-centre peak landed in PR 9202), walls that step in height.
- [x] **Shop drawings** (2026-10-21, `drawings.mjs`): one printable sheet per
      wall (SVG elevation with member marks, dimension chain, parts table; CLI
      `--drawings`, page button). Per-panel weights and cut lists (plates trimmed to the panel) landed 2026-10-22 in the shop drawings. Sheathing weight on panels (gable walls too, 2026-10-29) and per-panel sheets landed. Not yet: sheathing marks. A PDF without the browser landed 2026-10-27 (`pdf.mjs`, CLI `--pdf`, page button).

### 2. Getting the house in without typing

- [x] (2026-10-29, `sketch.mjs`, page card; click-checked in Chromium; no move/resize or tracing yet) A browser plan editor: draw walls on a grid, drop doors and windows,
      emit the plan JSON (corners and tees detected from geometry).
- [x] DXF floor plans landed 2026-10-27 (`dxf.mjs`, CLI and page; centre lines, tees, openings from lines; hand-built files only, no real plan yet). Still open: IFC
      `IfcWall` / `IfcOpeningElement`, both parsed in the browser.

### 3. The rest of the shell

- [x] Floor framing (2026-10-22, `floor.mjs`, CLI `--floor`): joist layout on a
      user-chosen spacing and size, optional beam that splits the runs, rim
      boards spliced over joists, blocking rows, subfloor sheets with joints on
      joists and staggered courses; lumber pooled into the wall order. Not yet:
      chases; cantilevers landed 2026-10-31 (`floor.cantilever`, engine and CLI plan key, hand-counted; page field `Cantilever past the back support` the same day, source-asserted only, not click-checked).
- [x] Roof (2026-10-22, `roof.mjs`, CLI `--roof`): gable roofs; rafter or truss count
      from a footprint and pitch (trusses as a purchased line), ridge, ceiling
      joists, collar ties, roof sheathing, underlayment and shingle squares.
      Hip roofs landed 2026-10-22 (`shape: "hip"`: commons, hips, jacks, trapezoid and triangle sheathing). Not yet: valleys, the page.
- [x] Foundation quantities (2026-10-24, `foundation.mjs`, CLI `--foundation`): footing, stem wall and slab (or a monolithic slab with thickened edge) concrete from closed-form geometry, trucks and short-load warning, rebar with lap splices and weight, form area and plywood, gravel base, vapor barrier. Hand-arithmetic tests only. Corner L-bars landed 2026-10-28 (`cornerBars`, page select; hand-arithmetic test). Anchor bolt spacing and end distance on the page 2026-10-27. Not yet: piers and columns, walkout/stepped footings, checking against a real foundation plan.
- [ ] Interior: drywall sheet counts per wall and ceiling landed 2026-10-24 (`drywall.mjs`, CLI `--drywall`, hand-count tests; joints not on studs, no page). Wall-cavity insulation bags landed 2026-10-24 (`insulation.mjs`, CLI `--insulation`, cavity measured from placed members; hand-arithmetic tests, no page). Joints on studs landed 2026-10-26 (walls; page control `Wall end joints` 2026-10-27). Insulation bags (wall, rim, attic) are in the budget from 2026-10-27. Trim (baseboard, casing boards) landed 2026-10-28 (`trim.mjs`, CLI `--trim`, budget lines; hand tests, no page). Shoe moulding landed 2026-10-29 (`trim.shoe`, own stock, hand test). Trim page controls for shoe moulding and scarf overlap landed 2026-10-29 (source-asserted test only, not click-checked). Not yet: ceiling joints on joists.

- [x] Exterior siding, house wrap and corner boards (2026-10-28, `siding.mjs`, CLI `--siding`, budget lines; hand tests; page card, browser-checked on the example house). Soffit, fascia and J-channel landed 2026-10-28 (`eaves.mjs`, CLI `--eaves`, hand tests, no page). Not yet: gables, window and door trim, vertical siding, a real siding order.

### 4. Time and money

- [x] Quantities x the builder's own unit prices -> a budget that ties every
      line to the model (2026-10-24, `budget.mjs`, CLI `--budget`, plan `prices`):
      lumber lines are the cutting-stock order's cost, sheets/bundles/concrete/rebar
      are the model's counts times typed prices, tax and contingency stack, and a
      quantity with no price is listed as unpriced, never guessed. Labor lines (typed `labor*` rates), the page and a CSV (page button; CLI `--budget --csv`, 2026-10-27) have landed.
- [x] A new-home schedule (2026-10-24, `schedule.mjs`, CLI `--schedule`, plan key
      `schedule: {start, crews, activities: [{id, name, days, after, crew, lag}], slips: [{id, days}]}`):
      critical path over the builder's own activity list and durations (forward and
      backward pass, slack, cycle and unknown-predecessor errors), weekdays only, `lag`
      for cure time and inspection waits, serial greedy crew levelling, and what a
      slipped activity does to the finish date. No durations are shipped. Hand-checked
      networks in `schedule.test.mjs`. Holidays and typed weather days landed 2026-10-29 (calendar dates only). Not yet: weather forecasts, resource
      calendars, activity templates tied to the takeoff's quantities, a real builder's list.
- [x] Bid leveling against the model's quantities (2026-10-28, `bidlevel.mjs`, CLI `--level-bids`, plan key `bids`; hand-made bids only, no real sub's bid checked, no page) (siblings:
      `bid-leveling-worksheet`, `estimate-maker`).

### 5. Research threads

- [ ] How much does an optimised order save over the allowance methods
      builders use? Needs real plans (public permit sets or open house plans
      with a permissive licence) rather than our invented house.
- [x] Advanced framing's material savings, measured on the same models with
      the same engine (2026-10-29, `advanced-bench.mjs`: all details + 24 in spacing -24 to -26% lumber cost on two houses; README; lumber only, no code check).
- [x] Panelised vs stick framing, from piece counts (2026-10-29, `panelised-bench.mjs`: members handled, saw cuts and site nails; no labour rate; two generated or invented houses, no real time study; README). Not yet: a real crew's time study to turn counts into hours.
