# Thrift Haul Buy Picker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/thrift-haul-buy-picker/>

A $15 price tag is a bargain or a loser depending on marketplace fees, shipping, how likely the item is to sell, how long
your cash sits and the hour you spend listing it. Paste what you found at a thrift store, estate sale, auction or
liquidation (the asking price, what you expect it to resell for and your own chance it sells) and get the expected profit
after all of that, the walk-away price for each item, the sell chance each needs to break even, the downside, and, under a
cash, item-count or hands-on-hours cap, the exact best set to buy. For eBay, Poshmark, Mercari, Etsy, Depop and
Marketplace resellers. Browser page or zero-dependency CLI.

```
node cli.mjs pick haul.csv --budget 80 --max-hours 2
cat haul.csv | node cli.mjs pick - --fee 13 --hourly 20 --json
```

Input: rows of `name,ask,resale,sell_chance[,ship,minutes,days,note]`. See `fixtures/haul.csv`.

## Your estimates, not a price guide

Every resale value, sell-through chance, fee and time figure is a number you type. The tool knows no resale prices, reads
no sold listings, scrapes nothing and predicts no sale. Marketplace fees change: copy them from the marketplace's current
fee page.

## How it decides

If an item sells you keep its resale price less the marketplace percentage and fixed fee, shipping and supplies. If it does
not, you recover a share of its value (default 30%). Expected revenue weights the two by your sell chance. Subtract what
you pay, your hands-on minutes at your hourly value, and the cash cost (annual rate x days / 365 on the ask) to get the
expected profit. Profit is linear in the sell chance, so the break-even chance and the walk-away price (the most you can
pay and still reach your minimum return) are closed forms. With a cash, item or hours cap the best set is found exactly by
branch and bound; the tests check it against every subset, and the tool says so if its size limit stops the search.

## What it is not

Not a forecast, a price guide, an authenticity opinion or financial advice, and no warranty. It ignores seasonality,
returns, price moves, and any marketplace rule about what may be sold. Checking that an item is genuine, safe and legal to
resell is yours.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.
Anonymous feature counts (`pick_run`, `example_loaded`) live in local storage only and can be switched off on the page;
Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
