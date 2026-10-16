# Interior Design Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/interior-design-fee-calculator/>

**Compare interior design fee models on one project, with scope creep priced in, and audit which fee model has actually paid you best.** Enter your design hours, site visits, procurement items and meetings, an expected and a stress overrun, your target hourly rate, and your rate for each model (hourly, flat, percent of project cost, per square foot, product margin, flat plus margin). Get each model's effective hourly, the overrun it can absorb before dropping under target, the fee you need and a walk-away fee. Paste past projects with fee model, fee and hours and see effective hourly by model. Browser page or zero-dependency CLI, for independent interior designers and small studios.

After using this, you can now pick a fee structure for a new project knowing what it earns per hour if the project runs 25 or 50 percent long, which used to take a spreadsheet and a hope that this client would be different.

```
node cli.mjs compare --design-hours 50 --project-cost 60000 --overrun 40 --target 110
node cli.mjs history fixtures/projects.csv --target 100
cat projects.csv | node cli.mjs history - --json
```

Project rows: `project,model,fee,hours`. See `fixtures/projects.csv`.

## Your numbers, not market rates

Every hour, rate, percentage and budget is a number you type. The tool knows no going rates, surveys no fees and predicts nothing. Defaults are placeholders: replace them with times you have tracked.

## How it computes

Baseline hours = design hours + site visits x hours + items x minutes / 60 + meetings x hours. Expected = baseline x (1 + overrun). Effective hourly = model fee / expected hours. Hourly fee = rate x expected hours x (1 - write-off). Percent = rate x project cost; per sq ft = rate x square feet; margin = margin x product spend; hybrid = flat + margin x product spend. Fee needed = expected hours x target. Walk-away = expected hours x target x floor percent. Break-even overrun = fee / target / baseline - 1.

## What it is not

Not tax, legal or licensing advice, not a fee survey, and no warranty. It ignores payment timing, taxes, and anything your contract or local rules say. Your contract comes first.

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`compare_run`, `history_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
