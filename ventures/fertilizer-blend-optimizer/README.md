# Fertilizer Blend Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fertilizer-blend-optimizer/>

Free, browser-only least-cost fertilizer program solver for row-crop, hay and
garden growers. List products with a price per ton and a grade (N, P2O5, K2O,
S), enter the pounds per acre of each nutrient your crop needs, and it finds the
pounds of each product per acre that meet every target at the lowest cost, the
field total and tons to buy, the cost of one more pound of each nutrient, the
price at which an unused product would start to pay, and what the obvious
one-product-per-nutrient plan costs against the optimum. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, a two-phase simplex (Bland's rule), nutrient prices and
  product entry prices by re-solving, the naive-plan comparison, and an
  independent `verifyPlan`.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-calculate-the-cheapest-fertilizer-blend.html` - guide whose worked
  table is recomputed by the test suite.

**No warranty.** Free and as-is; not agronomic or crop advisory advice and no
substitute for a certified crop advisor, a soil test or your extension service.
Starter grades are standard guaranteed analyses with EXAMPLE prices, and crop
targets are rounded rules of thumb. Application method, timing, nitrogen loss,
salt and burn risk, lime, micronutrients and freight are not modelled. Checked
against exhaustive vertex enumeration on small lists, not against real farms.

**Privacy.** Everything runs in your browser; your product list and field are
never uploaded and are not saved. Anonymous feature counts stay in local storage
and can be switched off.

MIT licence, see `LICENSE`.
