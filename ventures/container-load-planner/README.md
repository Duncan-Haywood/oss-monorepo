# Container Load Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/container-load-planner/>

Free, browser-only 3D load planner for small exporters, Amazon/FBA and DTC
sellers shipping cartons or pallets. List cargo lines (size, weight, quantity,
rotation, highest layer, weight allowed on top), pick a 20 ft, 40 ft, 40 ft high
cube, 53 ft trailer, 26 ft box truck, standard pallet or your own size, and it
reports what fits, what is left over, volume and weight use, how many containers
the whole load needs, a to-scale top and side view and a loading list. A "what if
I swap" table runs the same cargo through every standard size, loose and on
pallets. Metric or imperial. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing and units, the extreme-point 3D packer (orientation,
  support, layer and load-on-top constraints, payload), seeded multi-start
  search, greedy multi-container planning with tail consolidation, palletising,
  the container comparison, view geometry, and an independent `verifyPacking`
  checker.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-plan-a-container-load.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; a planning aid, not legal, tax, financial or
safety advice, and not a load-securing, axle-weight or compliance certificate.
It does not model bracing, axle weights, centre of gravity, pallet overhang,
dunnage, hazardous goods or carrier limits, and states no freight rate. The
packer is a heuristic: it tries many orderings and keeps the best, which is not
a proof of optimality. Container sizes and payloads are nominal and editable.
Unverified against a real loading: tested on hand-computed fits and on random
loads checked for overlap, bounds, weight, rotation, support and stacking.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
