# Christmas Tree Farm Profit Planner

A free browser tool for people planting or running a Christmas tree plantation.
Enter acres per year, survival, prices and costs. It lays out cash flow year by
year across planting blocks, finds the payback year, the deepest cash hole, NPV
and the blended price per tree needed to break even, and re-runs the plan across
survival rates, prices and wholesale vs choose-and-cut. Entirely client-side.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/christmas-tree-farm-profit-planner/

After using this, you can **see whether the 8-year wait pays, and what price or
survival rate decides it**, before buying a single seedling.

## Try it

Open [`index.html`](index.html) and click **Project my plantation**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Each year for
`plantYears` years you plant `acresPerYear` acres. A block is harvested
`harvestAge` years later and leaves the model (one rotation, no replant).
Sellable trees = planted x survival x (1 - culls). Costs: seedlings, planting,
site prep, early and mature upkeep per acre, land, selling cost per tree, fixed
costs and year-one equipment. NPV uses your discount rate; break-even price scales
both prices until NPV is zero.

## What this does not cover

Species, soil, pests, weather, deer, local rules, insurance and tax. Planning
arithmetic, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; usage counts are local, opt-out-able and honour Do Not Track.

## Run the tests

```
node --test
```
