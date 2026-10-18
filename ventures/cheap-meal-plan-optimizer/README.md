# Cheapest Meal Plan Optimizer

Free, browser-only minimum-cost diet solver. List foods with a price and
nutrition per serving, set calorie, protein, fat, carb and fibre bounds, and it
finds the lowest-cost servings per day that meet them, the weekly cost, what
each extra target costs, and how the cost rises with the protein minimum.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cheap-meal-plan-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, a two-phase simplex (Bland's rule), branch and bound
  for whole or half servings, marginal costs by re-solving, a shopper's
  rule-of-thumb baseline, and an independent `verifyPlan`.
- Variety limit: set "Most calories from one food (%)" (for example 30) and no single food may supply more than that share of the day's calories, which stops the cheapest plan being a bag of rice and nothing else. It is a linear row per food in the same solver, checked again by `verifyPlan`; leave it blank for the plain cheapest plan. Compare two runs to see what variety costs.
- What variety costs: a table runs the same plan with the one-food calorie cap at 50, 40, 30, 25 and 20 percent and shows the daily cost and foods used for each, so the price of a less repetitive menu is a number, not a guess (`varietyFrontier` in `calc.mjs`).
- Break-even prices: for every food the plan leaves out, the report gives the price per serving below which it would be used, and the drop needed from today's price, found by bisection on the continuous model (`breakEvenPrices` in `calc.mjs`); "never" means no price, even free, earns it a place. Use it to know which sale is worth waiting for.
- Share link: "Copy share link" writes the food list and targets into the URL fragment (`#foods=...`), which browsers never send to a server, so you can bookmark a menu or send it to someone; opening the link refills the form. `encodeShare`/`decodeShare` in `calc.mjs` keep only known numeric fields.
- Shopping list: add a ninth column, servings per pack (`Rice | 0.15 | 180 | 3.5 | 40 | 0.3 | 0.7 | | 36`), and the report turns the plan into whole packs for the week, with leftovers and the real till total (`groceryList` in `calc.mjs`). Pack price is price per serving times pack size, so the cheapest plan itself is unchanged.
- Returning each week: the food list and targets are remembered on this device (same `encodeShare` format, local storage key `cheap-meal-plan-setup-v1`), restored on load and cleared by "Forget saved data".
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-eat-high-protein-on-a-budget.html` - guide whose worked example is
  recomputed by the test suite.

## What you use today, and what this does differently

- **A spreadsheet and a calculator:** free and private, but finding the cheapest mix that hits protein and calorie targets by hand is guesswork, and you cannot see what one more gram of protein costs.
- **Meal-planning and macro-tracking apps** (nutrition loggers and recipe planners): large food databases and barcode scanning, usually behind an account, and most plan from recipes you pick rather than minimising your grocery cost. This tool has no food database, so you enter your own foods and local prices.
- **Published diet-problem examples and solver add-ins:** the same linear-programming idea, but you build and read the model yourself.
- **What this adds:** the lowest-cost servings per day for your own foods and bounds, what each extra target costs, how cost rises with the protein minimum, a variety limit, and a pack-level shopping list, all in the browser with nothing uploaded. It is not nutrition advice; see the notice below.

**No warranty.** Free and as-is; not medical, dietary or nutrition advice and no
substitute for a doctor or registered dietitian. It will not plan under 1,200
calories a day and is not suitable for children, pregnancy, eating disorders or
medical conditions. The starter foods carry approximate generic nutrition and
EXAMPLE prices: edit every price and check every label. Vitamins, minerals,
allergies and taste are not modelled; the cheapest plan is often repetitive.
Checked against exhaustive search on small random menus, not against real
shopping.

**Privacy.** Everything runs in your browser; your food list is never uploaded
and is not sent anywhere. So you can update prices each week, the food list and
targets are remembered in this browser's local storage only ("Forget saved data"
removes them; a share link loaded from the address replaces them). Anonymous
feature counts also stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
