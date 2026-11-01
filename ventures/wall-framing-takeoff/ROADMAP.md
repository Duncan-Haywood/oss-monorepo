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
      The page has the controls (rows, fire blocking; 2026-10-21, saved in plan files). Staggered blocks landed 2026-10-29 (`blocking.stagger`: alternate bays sit 1.5 in above and below the row line; fire-block rows allow for it; engine and plan files, not the page). Horizontal sheets need no nailers: end joints land on stud centres and every course joint gets joint blocks (checked with staggered rows and an opening 2026-11-01, `engine.test.mjs`).
- [x] **Corner plate laps** (2026-10-21, `plateLaps` in `engine.mjs`): top plate
      through one way, cap the other, piece lengths change, totals do not. Tee
      laps (2026-10-21, wall `tee: {wall, at, end}`): the partition's cap runs
      over the through wall's top plate and the through wall's cap is cut for it;
      page field "Butts into" landed 2026-10-21.
- [ ] **Advanced framing options.** Two-stud corners and ladder blocking at tees
      landed 2026-10-22 (plan `advanced`, page menu; measured on the example house:
      -4.5% order cost, README). Single top plate where framing stacks
      landed 2026-10-22 (`advanced.singleTopPlate`; no cap plate, tie count, -8.8% on the example house). Right-sized headers from a user-supplied table landed (`headers.mjs`; per-wall and per-stud tables 2026-11-01). Wall heat loss from the placed layout (UA, design BTU/h, seasonal kBTU from typed window/door U and degree-days) landed 2026-10-31 (`insulation.assembly.heat`; hand-arithmetic test; walls only; page fields landed 2026-10-31, source-tested only). Air leakage (typed ACH50, N-factor and volume; 0.018 x V x ACH50/N) landed 2026-10-31, hand test, page fields source-tested.
- [x] Deck framing (2026-10-30, `deck.mjs`, CLI `--deck`): joists, ledger or rims, dropped beam, posts, footings, decking rows, hardware count; hand-arithmetic tests, no real deck plan yet. Deck stairs landed 2026-10-30 (`deck.stairs` in the plan: `{width, tread, stringer, ...}`; total rise taken from the deck height; CLI only, hand-checked). Guard switch on the page card 2026-10-30. Picture-frame borders landed 2026-10-31 (`deck.border`, hand test). Deck stairs were already a page control (`dkStair`); the border select (`dkBorder`, 1 to 3 courses) landed 2026-10-31, source-asserted in `page.test.mjs` and click-checked in Chromium (16 x 12 ft deck, 1 course: 4 border boards).
- [x] **Gable walls** (2026-10-21, `layoutGable` in `engine.mjs`): wall `gable: {pitch}` (rise per 12 in), symmetric about the middle; studs cut to the long point of the angled cut, top and cap plates along the slope with joints over studs. Openings below the eave line landed 2026-10-21. Openings that rise into the triangle landed 2026-10-21 (header may top out above the eave line; cripples only where the roof clears it; a header that meets the slope at its lower end is rejected; engine and plan files, not the page). Sheathing the triangle landed 2026-10-22 (vertical sheets, own order). Not yet (the off-centre peak landed in PR 9202), walls that step in height.
- [x] **Shop drawings** (2026-10-21, `drawings.mjs`): one printable sheet per
      wall (SVG elevation with member marks, dimension chain, parts table; CLI
      `--drawings`, page button). Per-panel weights and cut lists (plates trimmed to the panel) landed 2026-10-22 in the shop drawings. Sheathing weight on panels (gable walls too, 2026-10-29) and per-panel sheets landed. Sheathing sheet marks (green outlines with the sheet id on each wall sheet when sheathing is computed) landed 2026-10-31 (`drawings.mjs`, test-checked; gable walls draw none). A PDF without the browser landed 2026-10-27 (`pdf.mjs`, CLI `--pdf`, page button).

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
      joist hole and notch check landed 2026-10-31 (`floor.penetrations`, hand tests, no page); cantilevers landed 2026-10-31 (`floor.cantilever`, engine and CLI plan key, hand-counted; page field `Cantilever past the back support` the same day, click-checked in Chromium 2026-10-31: card, saved plan and the 8 ft refusal in `eval-browser-click.mjs`).
- [x] Roof (2026-10-22, `roof.mjs`, CLI `--roof`): gable roofs; rafter or truss count
      from a footprint and pitch (trusses as a purchased line), ridge, ceiling
      joists, collar ties, roof sheathing, underlayment and shingle squares.
      Hip roofs landed 2026-10-22 (`shape: "hip"`: commons, hips, jacks, trapezoid and triangle sheathing). Cross wings with valleys (2026-10-22, `roof.wing`/`wing2`) and the page (2026-10-22) have since landed, see the README. Gable dormer framing quantities landed 2026-10-31 (`dormer.mjs`, CLI `--dormer`, plan `dormer`; closed-form geometry, hand-arithmetic tests, no page, no real dormer plan; opening in the main roof framed 2026-10-31 via `dormer.roofOpening`, hand tests). Shed dormers (`shape: "shed"`, `layoutShedDormer`, with front window and main-roof opening) landed 2026-10-31, hand tests. Dormer page fields (shape select gable or shed, roof-opening depth) landed 2026-10-31, clicked in Chromium (`eval-browser-click.mjs`). Main-plane sheathing shortened under a wing 2026-11-01 (hand test). Wing ridge height over its plates and below the main ridge reported 2026-11-01 (hand test). Gutters and downspouts on an equal-pitch wing's eaves landed 2026-11-01 (`gutters.mjs`, hand-counted 1224 in run, same as the fascia). Not yet: a wing off a wing. The page has had front-window fields since 2026-10-31; a negative sill is rejected (2026-10-31).
- [x] Foundation quantities (2026-10-24, `foundation.mjs`, CLI `--foundation`): footing, stem wall and slab (or a monolithic slab with thickened edge) concrete from closed-form geometry, trucks and short-load warning, rebar with lap splices and weight, form area and plywood, gravel base, vapor barrier. Hand-arithmetic tests only. Corner L-bars landed 2026-10-28 (`cornerBars`, page select; hand-arithmetic test). Anchor bolt spacing and end distance on the page 2026-10-27. Piers and columns (pads, columns, mat and vertical bars) and stepped footings have landed (hand tests). Pier bearing check landed 2026-10-31 (`piers[].load` with `soilBearing`: pressure, pass or fail, minimum pad; typed service load and soil figure, hand test). A walkout stem (`stem.walkout`: wedge of taller wall along one side, volume, forms and verticals, hand test) landed 2026-10-31. A walkout footing that steps with the grade landed 2026-10-31 (`stem.walkout.maxStepRise`: equal steps no taller than the figure, riser concrete, a 1:2 slope note; hand test, no page, no real plan). Not yet: checking against a real foundation plan.
- [ ] Interior: drywall sheet counts per wall and ceiling landed 2026-10-24 (`drywall.mjs`, CLI `--drywall`, hand-count tests; joints not on studs, no page). Wall-cavity insulation bags landed 2026-10-24 (`insulation.mjs`, CLI `--insulation`, cavity measured from placed members; hand-arithmetic tests, no page). Joints on studs landed 2026-10-26 (walls; page control `Wall end joints` 2026-10-27). Insulation bags (wall, rim, attic) are in the budget from 2026-10-27. Trim (baseboard, casing boards) landed 2026-10-28 (`trim.mjs`, CLI `--trim`, budget lines; hand tests, no page). Shoe moulding landed 2026-10-29 (`trim.shoe`, own stock, hand test). Trim page controls for shoe moulding and scarf overlap landed 2026-10-29 (click-checked in Chromium 2026-11-01: card text and saved plan in `eval-browser-click.mjs`). Ceiling joints on joists landed (`ceilingJoistSpacing` / `ceilingJoistsFromRoof`).

- [x] Exterior siding, house wrap and corner boards (2026-10-28, `siding.mjs`, CLI `--siding`, budget lines; hand tests; page card, browser-checked on the example house). Soffit, fascia and J-channel landed 2026-10-28 (`eaves.mjs`, CLI `--eaves`, hand tests, no page). Gable triangles, window and door trim and vertical siding have since landed (see the README); openings that rise into a gable triangle cut its courses from 2026-11-01 (hand test). Not yet: a real siding order.

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
      networks in `schedule.test.mjs`. Holidays and typed weather days landed 2026-10-29 (calendar dates only). Durations from takeoff quantities and a typed production rate landed 2026-10-31 (`per`/`rate`, CLI, hand tests). Page `schedule-calculator.html` (editable JSON, text report, bar chart; clicked in Chromium) landed 2026-10-31. Per-crew days off (`crewOff`, a resource calendar: work pauses on them, levelled dates; hand tests) landed 2026-10-31. Per-activity `notBefore` dates (start no earlier than a delivery, permit or long-lead order; hand tests, also under crew levelling) landed 2026-10-31. A spreadsheet export (`scheduleCsv`, CLI `--schedule --csv`, a Download CSV button on the page) landed 2026-10-31 (unit test on a hand-made schedule; the button is not click-checked). A contract-completion date field on the page (days late or to spare, via `deadline`) landed 2026-10-31, clicked in Chromium in `eval-schedule-click.mjs`. Schedule risk landed 2026-10-31 (`risk.mjs`, CLI `--risk`: a seeded Monte Carlo over `min`/`days`/`max` ranges giving P50/P80/P90 finish, chance of the deadline and a criticality index; hand-checked triangular draws and serial-chain bounds in `risk.test.mjs`; page field "Day ranges for risk" (`id=min-max`) landed 2026-10-31, clicked in Chromium in `eval-schedule-click.mjs`; ranges are yours, draws are independent). Per-activity `cost` with spend and cumulative spend by month (a draw-schedule view; even spread over levelled days; hand test, text and CSV; weekly spend chart on the page 2026-11-01, clicked in Chromium) landed 2026-10-31. Draw terms landed 2026-11-01 (`draw: {lagDays, retainagePct, releaseLagDays}`, page field `id=dr`, clicked in Chromium: the deepest gap between cash paid out and cash received, with retainage released after the last day; hand-checked in `schedule.test.mjs`; terms are typed, no lender's rules shipped). Not yet: weather forecasts, a real builder's list and rates.
- [x] Change orders (2026-11-01, `compare.mjs`, CLI `--compare=revised.json`): two plans priced each with its own `prices`, then the budget difference by line and section, lines priced on one side only listed rather than netted; hand-made budgets and a 16 in vs 24 in spacing case in `compare.test.mjs` (no page yet).
- [x] Bid leveling against the model's quantities (2026-10-28, `bidlevel.mjs`, CLI `--level-bids`, plan key `bids`; hand-made bids only, no real sub's bid checked, no page) Standalone page `bid-leveling-calculator.html` landed 2026-10-31 (clicked in Chromium, made-up sample). (siblings:
      `bid-leveling-worksheet`, `estimate-maker`).

### 5. Research threads

- [ ] How much does an optimised order save over the allowance methods
      builders use? Needs real plans (public permit sets or open house plans
      with a permissive licence) rather than our invented house.
      Measured on two generated houses 2026-10-28 and at 16 vs 24 in o.c. 2026-11-01 (`allowance-bench.mjs`, README): +2 to +25% at 16 in, +16 to +27% at 24 in. Left open for real permit sets.
- [x] Advanced framing's material savings, measured on the same models with
      the same engine (2026-10-29, `advanced-bench.mjs`: all details + 24 in spacing -24 to -26% lumber cost on two houses; README; lumber only, no code check).
- [x] Panelised vs stick framing, from piece counts (2026-10-29, `panelised-bench.mjs`: members handled, saw cuts and site nails; no labour rate; two generated or invented houses, no real time study; README). Not yet: a real crew's time study to turn counts into hours.
- 2026-11-01: stair stringer bearing (`stringerCheck.bearingFcPerp`, psi, and `bearingLength`, in, 3.5 unless typed; typed from the lumber table, none shipped): the end reaction over stringer thickness x bearing length is reported as `fcPerp` and warns above the typed allowable. Hand sums in `stairs.test.mjs` (277.8 lb over 1.5 x 3.5 in: 52.9 psi; over 1 in: 185.2 psi); the notch at the support, bearing on a ledger vs a slab and the connector's own table are not checked, no page field.
- 2026-11-01: stair stringer minimum bearing length (`stringerCheck.minBearingLength`, in = end reaction / (thickness x typed Fc-perp)), in the text report. Hand sum in `stairs.test.mjs` (277.8 lb / (1.5 x 425 psi) = 0.436 in). No page field, no real stair checked.
- 2026-11-01: stair stringer minimum throat (`stringerCheck.minThroat`, `minThroatGoverns`): the smallest section depth passing bending, shear and deflection at the typed loads, in the text report. Hand sums in `stairs.test.mjs` (bending 4.811 in governs; deflection 4.629 in; shear 1.54 in). No page field.
- 2026-11-01: the standalone stair page (`stair-stringer-calculator.html`) gained an optional "Check the stringer" section (typed live/dead load, Fb, Fv, E, optional Fc-perp; skipped unless the five are typed). Checked in headless Chromium over http (base page has no check; typed figures give 1276 of 900 psi bending, 6.12 in minimum throat, 0.41 in bearing, same as the engine). Click-checked 2026-11-01 by `eval-stair-click.mjs` (no check until all five values typed; Fc-perp adds the bearing line; clearing a field removes it).
- 2026-11-01: budget labor lines for siding and house wrap (`laborSidingSqFt`, per sq ft net of openings) and trim (`laborTrimFoot`, per foot of baseboard, shoe and casing), typed rates only, `budget.test.mjs`. No real contractor rates; CLI/plan key only, the page's price box accepts the names but has no labelled field.
- 2026-11-01: budget labor lines for eaves (`laborEavesFoot`, per foot of eave plus rake) and gutters (`laborGutterFoot`, per foot of run), typed rates only, `budget.test.mjs`. No real contractor rates; plan key only, no page field.
- 2026-11-01: budget labor line for hold-downs and plate straps (`laborHoldDown`, per piece, typed rate only), `budget.test.mjs` (hand product check). No real contractor rate; plan key only, no page field.
- 2026-11-01: budget labor line for stairs (`laborStairRiser`, per riser, both flights of a landing stair counted; typed rate only; click and unit tests in `budget.test.mjs`)
- 2026-11-01: budget labor line for wall sheathing (`laborWallSheet`, per sheet, typed rate only), `budget.test.mjs`. No real contractor rate; plan key only, no page field.
- 2026-11-01: the page's budget price box help now lists every price name the engine reads (it omitted the siding, trim, eaves, gutter, sheathing and hold-down labor rates and 30 material names); `budget.test.mjs` fails if a name is missing from `index.html`. Still a plain textarea, no labelled fields.
- 2026-11-01: the budget now has a Deck section (`budget.mjs`): the deck's own pressure-treated order, footing concrete bags (`deckConcreteBag`), screw boxes (`deckScrewBox`) and a typed labor line (`laborDeckSqFt`, per sq ft of deck); ties checked against `layoutDeck` in `budget.test.mjs`. No real deck plan or contractor rate; plan key only.
- 2026-11-01: the budget price box gained an "Add a price line" picker (every price name the engine reads; appends `name, ` once). Click-checked in Chromium (`eval-browser-click.mjs`, 0 page errors).
- 2026-11-01: budget labor line for stairs (`laborStairRiser`, per riser across every flight, typed rate only; unpriced when no rate), `budget.test.mjs` (14 risers x 40 = 560 by hand). Page price list and picker carry the name. No real contractor rate.
- 2026-11-01: budget prices stair connectors (`stairConnector`) and solid riser boards (`stairRiserBoard`); removed a duplicated stairs labor line (two sessions landed it, so labor was counted twice). Test in `budget.test.mjs`. Rails still unpriced.
- 2026-11-01: budget prices the handrail run (`handrailFoot`, per linear foot, typed price only; test in `budget.test.mjs`). Guard rail boards are in the lumber order. No real rail catalogue.
- 2026-11-01: budget prices stair balusters (`stairBaluster`), guard posts (`stairRailPost`) and handrail wall brackets (`handrailBracket`) from the rail layout, each typed price only; test in `budget.test.mjs`. Rail lumber was already in the cutting-stock order. No real rail order or prices.
- 2026-11-01: budget prices drywall finishing from the engine's own counts: screws (`drywallScrewThousand`, per 1,000), tape rolls (`drywallTapeRoll`), joint compound pails (`drywallCompoundPail`) and corner bead sticks (`cornerBeadStick`), each only when a price is typed; page help and picker carry the names. `budget.test.mjs`. Compound and screw rates are the engine's typed defaults, not measured; no real drywall order.
- 2026-11-01: budget prices the dormer (`dormerBoardFoot`, per board foot of the dormer's listed framing parts, no stock-length waste; `dormerRoofSqFt`, per sq ft of dormer roof), typed prices only; hand sums in `budget.test.mjs`. The dormer was the one framing engine the budget ignored. No real dormer or price; page picker/help carry the names.
- 2026-11-01: budget labor line for the dormer (`laborDormerSqFt`, per sq ft of dormer roof, typed rate only; unpriced without a rate), `budget.test.mjs` (50 x 7 = 350 by hand). Page price list and picker carry it. No real contractor rate.
- 2026-11-01: the budget reports cost per sq ft of floor framed (`perFloorSqFt` = total / the floor model's subfloor area, one level; partial while lines are unpriced; text and JSON). Test in `budget.test.mjs`. Not a per-house-area figure for multi-level plans.
- 2026-11-01: budget sections report their share of the priced lines (`sections[].share`, percent, before tax and contingency; text subtotals show it). Test in `budget.test.mjs`.
- 2026-11-01: the budget reports whole-budget cost per linear foot of wall (`perWallFoot` = total / `summary.wallFeet`; partial while lines are unpriced; text and JSON). Test in `budget.test.mjs`. A ratio of everything over wall length, not a wall-only cost; no real bid to compare.
- 2026-11-01: schedule draw terms take a typed `markup` (`draw: {markup: 0.25}`): each day's spend is billed at cost x (1 + markup), so the float and retainage reflect what the builder invoices (overhead and profit included), not bare cost. Hand-checked in `schedule.test.mjs` (1000 a day, 1.25x, 10% retainage: 250 held). Engine and CLI plan key only, no page field; the markup is typed, not read from the budget's bid.
- 2026-11-01: schedule page field `Markup on draws` (`id=mk`, percent; needs draw terms): sends `draw.markup`; clicked in Chromium in `eval-schedule-click.mjs` (25% shows "billed at cost +25.0%", a negative is refused). Engine slice from the entry above; no lender rules shipped.
- 2026-11-01: the budget reports the labor share of the cost total (`laborPct`, labor over cost before overhead and profit; null with no labor; partial while lines are unpriced), text and JSON. Test in `budget.test.mjs`. A ratio of typed rates, not a benchmark.
- 2026-11-01: heat loss reports yearly fuel and cost per typed heating system (`insulation.assembly.heatingSystems: [{name, efficiency, unitBtu, pricePerUnit}]`; needs `heatingDegreeDays`; text report and JSON). Hand-checked in `insulation.test.mjs`. No prices or efficiencies shipped; plan key only, no page field.
- 2026-11-01: standalone page `change-order-calculator.html` for the change-order diff (`compare.mjs`): type budget lines before and after (section, item, unit, qty, amount), see added, removed and changed lines with differences; lines priced on one side are listed, not netted. Clicked in Chromium (`eval-change-order-click.mjs`: sample diff, -252.00 total, unpriced line, bad JSON) and FAQ/hand-sum test in `page.test.mjs`. Lines are typed by hand; the page does not run the takeoff on two plans (that is CLI `--compare`).
- 2026-11-01: customer proposal (`bidletter.mjs`, CLI `--proposal`): the budget as a scope-and-price letter with markup hidden in the section prices, typed exclusions and terms, refused while any line is unpriced. Hand tests only; no page; no real proposal checked.
- 2026-11-01: the budget reports the bid price per linear foot of wall (`bidPerWallFoot`, whole bid over `summary.wallFeet`; only when overhead or profit lifts the bid above cost; text and JSON), the bid-side twin of `perWallFoot`. Test in `budget.test.mjs`. A whole-bid ratio, not a wall-only price; no real bid to compare.
- 2026-11-01: the page gets the customer proposal card and `allowance Name, amount` price lines (saved in the plan). Same `bidletter.mjs` and `budget.mjs` as the CLI, so no new arithmetic; clicked in Chromium (`eval-browser-click.mjs`). No real builder's proposal compared.
- 2026-11-01: budget labor line for setting doors and windows (`laborOpening`, per framed opening; count = king studs / 2, so a gang of windows sharing kings undercounts; typed rate only), `budget.test.mjs` (12 x 85 = 1020 by hand on the sample house). Page price list and picker carry it. No real contractor rate.
- 2026-11-01: the customer proposal takes a typed payment schedule (`proposal.payments: [{name, pct}]`, must add to 100%; last milestone absorbs cent drift; text and JSON). Hand sums in `bidletter.test.mjs`. No lender or state deposit limits shipped; plan key only, no page field.
- 2026-11-01: the page's customer proposal gained "Open printable page" (`proposalHtml` in `bidletter.mjs`: self-contained HTML, typed text escaped, no script, for print or save-as-PDF). Hand test in `bidletter.test.mjs`; the button was click-checked later the same day (`eval-browser-click.mjs`: popup opens with client, allowance and exclusion, no script, 0 page errors).
- 2026-11-01: `how-many-studs-for-a-wall.html` gained a visible FAQ (4 questions, figures from the page's own worked example) with matching `FAQPage` JSON-LD; `page.test.mjs` checks visible text equals the structured data.
- 2026-11-01: the page's customer proposal card gained a "Payment schedule" box (one `name, percent` per line, must add to 100; sends `proposal.payments`). Same `bidletter.mjs` arithmetic as the CLI; clicked in Chromium (`eval-browser-click.mjs`: Deposit 30 / Final 70 appear in the preview, 0 page errors). No lender or state deposit limits shipped.
- 2026-11-01: seeded fuzz test for the floor framing engine (`floor-fuzz.test.mjs`, 300 random floors: refused with a reason, or joists within the longest board, rims covering the width, sheets bought, cuts listed). Invariants only; no real floor plan.
- 2026-11-01: seeded fuzz test for the roof framing engine (`roof-fuzz.test.mjs`, 300 random gable and hip roofs: refused with a reason, or sheathing courses add to the slope, sheets and squares positive, cut list and text build). Invariants only; no real roof plan.
