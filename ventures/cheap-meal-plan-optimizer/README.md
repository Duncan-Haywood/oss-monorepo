# Cheapest Meal Plan Optimizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cheap-meal-plan-optimizer/>

Free, browser-only minimum-cost diet solver. List foods with a price and
nutrition per serving, set calorie, protein, fat, carb and fibre bounds, and it
finds the lowest-cost servings per day that meet them, the weekly cost, what
each extra target costs, and how the cost rises with the protein minimum.
Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, a two-phase simplex (Bland's rule), branch and bound
  for whole or half servings, marginal costs by re-solving, a shopper's
  rule-of-thumb baseline, and an independent `verifyPlan`.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-eat-high-protein-on-a-budget.html` - guide whose worked example is
  recomputed by the test suite.

**No warranty.** Free and as-is; not medical, dietary or nutrition advice and no
substitute for a doctor or registered dietitian. It will not plan under 1,200
calories a day and is not suitable for children, pregnancy, eating disorders or
medical conditions. The starter foods carry approximate generic nutrition and
EXAMPLE prices: edit every price and check every label. Vitamins, minerals,
allergies and taste are not modelled; the cheapest plan is often repetitive.
Checked against exhaustive search on small random menus, not against real
shopping.

**Privacy.** Everything runs in your browser; your food list is never uploaded
and is not saved. Anonymous feature counts stay in local storage and can be
switched off.

MIT licence, see `LICENSE`.
