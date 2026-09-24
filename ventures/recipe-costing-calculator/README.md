# Recipe Costing Calculator

A free browser tool that converts **as-purchased (AP) ingredient price** and a
**trim/cook yield percentage** into **edible-portion (EP) cost**, rolls a short
ingredient list up into a **total recipe cost** and a **per-portion plate
cost**, and shows the **menu price needed to hit a target food-cost
percentage** — or the actual food-cost percentage at a current menu price.
Nothing is uploaded; the arithmetic runs on the visitor's own device.

```
cd ventures/recipe-costing-calculator && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

An invoice gives you the as-purchased price. Trim, cook loss, and prep waste
mean that is never the cost of what actually lands on a plate, and the gap is
invisible until someone weighs the trim.

**AP price ÷ yield % = EP cost.** A $3.50/lb item with a 75% trim yield costs
$4.67/lb once you account for what never reaches a portion. Skipping this step
is the single most common way a recipe's "ingredient cost" understates what a
dish actually costs.

**Yield can exceed 100%.** Dried beans, rice, and stocks gain weight as they
absorb liquid, so their edible-portion weight is *more* than what was
purchased dry. The same formula applies; it just lowers the effective cost
instead of raising it. The calculator notes this explicitly rather than
treating it as an error.

**The reverse calculation matters as much as the forward one.** Once a plate
cost is known, the menu price for a target food-cost percentage is
`plate cost / (target % / 100)` — solved for you, instead of a formula rebuilt
by hand each time an ingredient price changes.

## What it does not do

It is not a full recipe-management system, a POS integration, or food-safety,
tax, or financial advice. It costs one recipe at a time with a fixed set of
ingredient rows; a full recipe book with nested sub-recipes and a live
supplier price feed is a spreadsheet or dedicated software's job, not this
form's.

## First visitor

The search phrases "recipe costing calculator," "AP EP yield cost," "plate
cost calculator," and "food cost calculator recipe," plus r/KitchenConfidential,
r/AskCulinary, and r/restaurantowners, where operators already discuss food
cost as a recurring, named problem. Several paid products (MarketMan, Toast
plate costing, Craftable) sell this exact calculation as a feature of a larger
platform — proof of real demand for the underlying math, and a gap this tool
closes for a kitchen that wants one recipe costed without buying a system.

## Comparing to other portfolio calculators

Already know a dish's plate cost and want to classify it as a star, plowhorse,
puzzle, or dog? See the [menu engineering calculator](../menu-engineering-calculator/).
Costing bar pours instead of plates? See the [pour cost calculator](../pour-cost-calculator/).

## Privacy

Everything runs in your browser. Ingredient prices, quantities, and menu
prices are never uploaded and never appear in a usage count — those are
anonymous tallies of which features were used, stored locally. We don't have
accounts, tracking cookies, or an analytics vendor.

## Usage

Anonymous, aggregate-only event counts (`recipe_calculated`, `numbers_saved`)
are kept in the visitor's own browser via `localStorage` — see
[`usage.mjs`](usage.mjs). No ingredient price, quantity, or menu price is ever
recorded. A checkbox in the page footer turns counting off entirely, and the
counter also honours the browser's own Do Not Track / Global Privacy Control
signal.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not culinary, food-safety, tax, or
financial advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it.**
To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. Do not use
this as a system of record.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.
