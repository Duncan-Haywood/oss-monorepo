# Snow Plow Contract Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/snow-plow-contract-calculator/>

**Compare per-push, per-inch, seasonal flat, capped and hybrid snow plow contracts on your own route across a low, normal and high snow year, and audit which contract model has actually paid you best per hour.** List your sites and the storms you expect, enter what your truck, driver, fuel, blade wear, deadhead and salt cost, and get each model's expected season revenue and effective hourly in each kind of year, the storm count where it stops paying, the seasonal flat price that clears your target in a low year versus the price that loses money in a high year, and a walk-away price. Paste past site-seasons with contract model, revenue and hours and see net hourly by model. Browser page or zero-dependency CLI, for independent snow plowing and ice-management contractors.

After using this, you can now see before you sign a seasonal contract what it pays if the winter is mild and what it costs you if it is not, which used to take a spreadsheet and a guess about the weather.

```
node cli.mjs compare --sites fixtures/sites.csv --normal 12,6,3 --target 35
node cli.mjs compare --high 16,12,6 --json
node cli.mjs audit fixtures/seasons.csv --target 35
cat seasons.csv | node cli.mjs audit - --json
```

Site rows: `name,hours,perPush,seasonalFlat,perInch,trigger,saltLbs`. Season rows: `site,model,revenue,hours[,season]`. See `fixtures/`. Without `--sites` the three example sites are used.

## Your numbers, not market rates

Every price, depth, storm count and cost is a number you type. The tool knows no going rates, reads no weather and predicts no winter. Defaults are placeholders: replace them with times, counts and costs you have tracked.

## How it computes

A storm is plowed at a site when its band depth is at least the site's trigger depth. Hours per plowed visit = site hours x band time multiplier + deadhead minutes / 60. Cost = hours x (truck and driver + fuel + blade wear) + plows x salt pounds x salt cost. Per push = plows x price. Per inch = billed inches x price, inches past the tier break at a higher rate. Seasonal flat = the flat price. Capped = the flat + plows beyond the cap x per-push price. Hybrid = flat x base percent + plows x per-push price x push percent. Effective hourly = (revenue - cost) / hours. Flat price for target = cost + hours x target; loses money below cost; walk-away = normal-year cost + hours x target x floor percent. The storm count where a model first stops paying scales the normal year's storms up until profit per hour falls under target, or below zero.

## What it is not

Not tax, legal, insurance or contract advice, not a price survey, not a weather forecast, and no warranty. It ignores payment timing, taxes, liability for snow and ice, and anything your contract or local rules say. Your contract comes first.

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`compare_run`, `audit_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
