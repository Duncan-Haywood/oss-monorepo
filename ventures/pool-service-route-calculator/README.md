# Pool Service Route Calculator

**Find out what each pool account on your route really earns per hour once the drive, the chemicals and the callbacks are counted, which to reprice or drop, and what a stop 15 minutes away does to the whole route.** Enter every account's monthly price, visit minutes, drive minutes into the stop, chemical cost per month and callbacks per year, plus your truck cost and a target hourly. Get a ranked list with the price that clears your target, a keep, reprice or drop move, the route's hourly if the account were gone, a new-stop table by drive minutes, and a CSV you can keep. Browser page or zero-dependency CLI, for independent pool service route owners.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pool-service-route-calculator/

After using this, you can now see which accounts the route is paying you to keep and which it is paying for you to carry, which used to take a spreadsheet and a guess about the drive.

```
node cli.mjs audit fixtures/accounts.csv --target 40
node cli.mjs audit accounts.csv --csv > audit.csv
cat accounts.csv | node cli.mjs audit - --json
node cli.mjs stop accounts.csv --leg 15 --price 140
```

Account rows: `name,price,visitMin,driveMin,chemicals,callbacks`. See `fixtures/accounts.csv`.

## Your numbers, not market rates

Every price, minute and cost is a number you type. The tool knows no going rates and predicts no customer response. Defaults are placeholders: replace them with times and costs you have tracked.

## How it computes

Hours a month = visits x (visit + drive minutes) / 60 + callbacks / 12 x callback minutes / 60. Truck cost = (drive hours + callback hours) x truck cost per hour. Cost = chemicals + truck + helper pay x hours + callbacks / 12 x parts. Effective hourly = (price - cost) / hours. Price for target = cost + target x hours. Move: keep at or above target; reprice if the increase needed is within your limit; drop otherwise. Route hourly if dropped = the route's net and hours without that account (freed hours assumed not refilled). A new stop is scored with the drive minutes you type, and the table repeats it at 5, 10, 15, 20 and 30 minutes.

## What it is not

Not tax, legal or contract advice, not a price survey, not a prediction of who will cancel, and no warranty. It ignores payment timing, taxes, equipment purchases, seasonality and anything your service agreement says. Drive minutes are your own estimate of the leg into each stop.

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`audit_run`, `example_loaded`, `csv_downloaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
