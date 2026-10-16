# Ag Spray Drone Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ag-spray-drone-quote-calculator/>

Free, browser-only quote calculator for custom applicators who spray with agricultural
drones. Enter your drone (swath, speed, pump, tank), batteries and costs, then a list
of fields; it works out the real time on each field, the cost per acre, a recommended
quote that respects your minimum charge, and the acres you need this season to break
even. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - flow-limited speed, sortie limits (tank vs battery), crew turnaround vs
  battery charging (closed form, re-checked by an independent sortie-by-sortie replay in
  `verifyPlan`), cost lines, recommended quote, price ladder and break-even.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-price-spray-drone-application-per-acre.html` - guide whose worked table is
  recomputed by the test suite.

**No warranty.** Free and as-is; not agronomic, pesticide, aviation, legal, tax or
financial advice. Rates, specifications, costs and prices are what you type; the
starter values are examples. Weather windows, water hauling, chemical cost, re-flies and
compliance costs are not modelled. Checked against a replay of the arithmetic, not
against flown fields.

**Privacy.** Everything runs in your browser; your fields and costs are never uploaded
and are not saved. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
