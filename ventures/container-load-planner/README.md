# Container Load Planner

Free, browser-only 3D load planner for small exporters, Amazon/FBA and DTC
sellers shipping cartons or pallets. List cargo lines (size, weight, quantity,
rotation, highest layer, weight allowed on top), pick a 20 ft, 40 ft, 40 ft high
cube, 53 ft trailer, 26 ft box truck, standard pallet or your own size, and it
reports what fits, what is left over, volume and weight use, how many containers
the whole load needs, a to-scale top and side view and a loading list. A "what if
I swap" table runs the same cargo through every standard size, loose and on
pallets. Metric or imperial. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/container-load-planner/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing and units, the extreme-point 3D packer (orientation,
  support, layer and load-on-top constraints, payload), seeded multi-start
  search, greedy multi-container planning with tail consolidation, palletising,
  the container comparison, view geometry, and an independent `verifyPacking`
  checker.
- Printable load plan: one self-contained HTML file (no script) with a to-scale top and side SVG per container, the ordered-versus-packed table, the balance check, the loading list and the disclaimer, to print to PDF for the warehouse or the forwarder (`planReportHtml`).
- Share link: `encodeShare`/`decodeShare` put the whole form in the URL hash (`#plan=...`) so a plan can be sent to a forwarder or colleague; nothing is stored on a server.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-plan-a-container-load.html` - guide with a worked example that the
  test suite recomputes.

## What you use today, and what this does differently

- **A spreadsheet of cubic metres:** quick, but total volume ignores carton shapes, rotation limits, stacking and weight, so it overstates what fits.
- **Freight forwarder or carrier quotes and their load calculators:** accurate for their own booking, but usually need contact details and are tied to a quote. This tool needs no signup and states no rate.
- **Desktop and paid load-planning software:** deeper (axle weights, bracing, carrier rules), and priced and set up for logistics teams. This tool is for the earlier question of how many containers to book.
- **What this adds:** a to-scale 3D packing with rotation, support and load-on-top rules, an independent checker of each plan, a swap table across standard container sizes, a centre-of-gravity check (back-heavy, side-heavy or top-heavy loads are flagged), and a loading list. Nothing is uploaded.

**No warranty.** Free and as-is; a planning aid, not legal, tax, financial or
safety advice, and not a load-securing, axle-weight or compliance certificate.
It reports the centre of gravity (assuming evenly loaded units) but does not model bracing, axle weights, pallet overhang,
dunnage, hazardous goods or carrier limits, and states no freight rate. The
packer is a heuristic: it tries many orderings and keeps the best, which is not
a proof of optimality. Container sizes and payloads are nominal and editable.
Unverified against a real loading: tested on hand-computed fits and on random
loads checked for overlap, bounds, weight, rotation, support and stacking.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
