# Price Increase Break-Even Calculator

How many customers can you lose after a price increase? Paste items (name, price, unit cost, units sold),
set the raise, and see per item how much volume you can lose before profit falls, the customer sensitivity
(elasticity) at which the raise stops paying, and which items can take it first. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/price-increase-breakeven-calculator/

```
node cli.mjs analyze items.csv --increase 8
cat items.csv | node cli.mjs analyze - --increase 5 --elasticity 1.5
node cli.mjs analyze items.csv --increase 8 --json --fail-on warn   # CI: exit 1 if an item loses money
```

## The model

Break-even volume loss is `(new price - old price) / (new price - unit cost)`. Expected units follow
`units x (1 + increase)^-elasticity`, with elasticity an assumption you set (default 1). The elasticity at which
a raise is profit-neutral is solved in closed form per item and by bisection for the whole list. Costs stay flat
and items do not affect each other.
