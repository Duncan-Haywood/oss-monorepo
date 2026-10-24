# Beef Cattle Ration Optimizer

Free, browser-only least-cost ration formulator for beef cattle. List feeds with
a price per ton, dry matter and protein, TDN, calcium and phosphorus; choose an
animal class; and it finds the pounds of each feed per head per day that meet
every requirement at the lowest cost, the herd cost and buying list, what each
requirement costs, and the price at which an unused feed would start to pay.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/beef-cattle-ration-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, a two-phase simplex (Bland's rule), shadow prices and
  feed entry prices by re-solving, and an independent `verifyPlan`.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-formulate-a-low-cost-cattle-ration.html` - guide whose worked table is
  recomputed by the test suite.

**No warranty.** Free and as-is; not veterinary or animal nutrition advice and no
substitute for a veterinarian or qualified nutritionist. Starter feed values are
approximate book values with EXAMPLE prices, and class requirements are rounded
rules of thumb. Trace minerals, vitamins, ionophores, non-protein nitrogen
limits and mycotoxins are not modelled. Checked against exhaustive search on a
small list, not against real herds.

**Privacy.** Everything runs in your browser; your feed list is never uploaded
and is not saved. Anonymous feature counts stay in local storage and can be
switched off.

MIT licence, see `LICENSE`.
