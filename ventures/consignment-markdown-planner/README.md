# Consignment Markdown Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/consignment-markdown-planner/>

A fixed 25%-at-30-days, 50%-at-60 rule treats a $12 tee and a $210 handbag the same. Paste the items on your
consignment or resale floor (price, weekly sell rate, your share of the sale, shelf cost per week) and get the
exact markdown schedule with the highest expected profit for each, which items are not worth taking in and what
price or shop share would make them worth it, and what a fixed rule leaves on the table. Browser page or
zero-dependency CLI.

```
node cli.mjs plan items.csv --weeks 12 --lift 0.35 --levels 0,10,25,40,50 --json
cat items.csv | node cli.mjs plan - --handling 2
```

Input: rows of `name,price,weekly_sell_pct,shop_share_pct,shelf_cost_per_week[,weeks][,note]`. See `fixtures/items.csv`.

## How it decides

Weekly sell chance = min(cap, base rate x (1 + lift x discount / 10)). Selling at discount d earns the shop
price x (1 - d) x shop share; every week on the floor costs shelf space; handling is paid once. Discounts only
deepen. The best schedule over the allowed levels is found exactly by dynamic programming over (week, level); the
tests check it against every non-decreasing schedule. It also scores a fixed 30/60 rule and never marking down,
re-checks the plan at a slow-season sell rate, and bisects the price and shop share at which a declined item
would pay.

## What it is not

Not a forecast: it compares schedules using numbers you supply. Seasonality, consignor price-floor agreements,
grouped sales and donation value of unsold items are not modelled. Not financial, tax or legal advice, no
warranty. You remain responsible for your consignment agreements.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
