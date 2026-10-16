# Market Event Picker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/market-event-picker/>

The Saturday festival pays the biggest booth fee, but it blocks the morning market and the evening rally
that together net more. Paste the markets, fairs and festivals you could work, with expected sales, booth
fee or percentage cut, travel and hours, and see the exact set that earns the most after costs, with the
reason for every event skipped, break-even sales for each one kept and the fee cut that would flip a
skipped one. Browser page or zero-dependency CLI.

```
node cli.mjs plan events.csv --cogs 35 --crew-rate 15 --max-per-week 2
cat events.csv | node cli.mjs plan - --json
```

Input: rows of `name,date,start,end,expected_sales,flat_fee,pct_fee,travel[,note]`. See `fixtures/events.csv`.

## How it decides

Net per event = sales x (1 - cost of goods - percentage fee) - flat fee - travel - crew rate x (event hours +
setup + teardown). Events whose windows overlap (setup before and teardown after included) cannot both be
worked, and an optional weekly limit caps events per Monday-to-Sunday week. The best set is found exactly by
exhaustive search with pruning over each cluster of connected events; the tests check it against trying every
subset on 300 random seasons. It also scores taking events in the order listed and biggest sales first,
re-checks the plan at a bad-weather sales percentage and says what each skipped event's swap would cost.

## What it is not

Not a forecast: it chooses between the events you list using numbers you supply. Sales tax, permits, parking
and repeat-customer value are not modelled. Not financial, tax or legal advice, no warranty. You remain
responsible for event applications, deadlines and contract terms.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
