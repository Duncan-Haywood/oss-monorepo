# Dog Grooming Price Calculator

**Price each dog class from its real minutes and audit which breed classes underpay your hourly rate.** Enter breed classes with a base price and plain-groom minutes, optional matting and de-shedding extras, drive time for mobile work, supplies and your no-show rate. Get each class's effective hourly, the price needed to hit your target hourly and a walk-away price. Paste past appointments (breed class, price, minutes) and see which classes underpay. Browser page or zero-dependency CLI, for independent salon and mobile dog groomers.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dog-grooming-price-calculator/

After using this, you can now see which breed classes earn under your target per table hour and the price that fixes each one, which used to take a spreadsheet and a guess about how long doodles really take.

```
node cli.mjs compare fixtures/classes.csv --target 60 --drive 20
node cli.mjs audit fixtures/appointments.csv --target 60
cat appointments.csv | node cli.mjs audit - --json
```

Class rows: `class,price,minutes[,supplies,matting_minutes,matting_fee,deshed_minutes,deshed_fee]`. Appointment rows: `breed_class,price,minutes`. See `fixtures/`.

## Your numbers, not market rates

Every price, minute and percentage is a number you type. The tool knows no going rates, surveys no groomers and predicts nothing. Defaults are placeholders: replace them with times you have tracked.

## How it computes

Slot hours = (minutes + drive minutes) / 60. Effective hourly = (price - supplies) x (1 - no-show rate) / slot hours. Price for target = target x slot hours / (1 - no-show rate) + supplies. Walk-away = the same at a floor rate (percent of target). Audit: revenue less supplies over slot hours per class, with lost no-show slots added to the hours, and the raise per dog that would reach target.

## What it is not

Not tax, legal or business advice, not a price survey, and no warranty. It ignores card fees, overhead, taxes and anything your own costs or local rules say. Related: `dog-grooming-profit-calculator` (service profit and booth rent vs commission), `dog-grooming-day-planner` (best dogs for a day) and `pet-grooming-bid-calculator` (a quote from size, coat and add-ons).

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`compare_run`, `audit_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
