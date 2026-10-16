# CSA Share Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/csa-share-pricing-calculator/>

A farm sells a season of weekly produce boxes up front, and a share that looks fair to members can still pay
the farmer a few dollars an hour. List the items in the box with their weeks, retail value, cost and labour
and see what a member gets at retail, what the season pays you per hour, the price that pays your target
wage, the shares needed to break even, and a price sweep. Browser page or zero-dependency CLI.

```
node cli.mjs price box.csv --weeks 20 --shares 60 --price 500
cat box.csv | node cli.mjs price - --json
```

Input: rows of `item,qty_per_box,value_each,cost_each,minutes_each,weeks[,note]`. See `fixtures/box.csv`.

## How it decides

Per share, summed over the weeks each item is in the box: retail value, item cost and hours; plus packaging,
delivery and packing time every week. Profit before your pay = shares x (price x (1 - fee) - costs) - fixed
costs; after your pay it also subtracts hours at your rate. The wage price and break-even shares are
closed-form (the tests check that the wage price pays exactly the target wage). The price sweep assumes
members fall as (price / base price)^-elasticity, an assumption you set.

## What it is not

Not a forecast: it prices a share from numbers you supply. Land, equipment, taxes, crop failure and refunds
are not modelled. Not financial, tax or legal advice, no warranty.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
