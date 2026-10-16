# Bookkeeping Client Fee Calculator

**Price a monthly bookkeeping retainer from the work the client actually brings, and find which current clients underpay you.** Enter a prospect's monthly transactions, accounts, payroll runs, AR/AP volume and sales-tax filings, the state of their books (clean, average, messy) and your target hourly rate, and get the minimum monthly fee, a recommended fee, a one-time cleanup quote and a walk-away price. Paste your existing clients with fee and hours and get them ranked by effective hourly, with the raise each needs. Browser page or zero-dependency CLI, for independent bookkeepers and fractional accountants.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bookkeeping-client-fee-calculator/

After using this, you can now quote a new client a monthly fee you know clears your target hourly rate, and see which current clients need a raise, which used to take a spreadsheet and a guess at how long each client really takes.

```
node cli.mjs price --transactions 420 --accounts 4 --cleanliness messy --cleanup 3 --competitor 600
node cli.mjs roster fixtures/roster.csv --target 80
cat clients.csv | node cli.mjs roster - --json
```

Roster rows: `client,fee,hours[,software]`. See `fixtures/roster.csv`.

## Your numbers, not market rates

Every volume, minute-per-task, rate and software cost is a number you type. The tool knows no going rates, surveys no fees and predicts nothing. Defaults (1 minute per average transaction, 20 minutes per reconciliation and so on) are placeholders: replace them with times you have measured.

## How it prices

Monthly minutes = transactions x minutes per transaction for the state of the books + accounts x reconciliation minutes + payroll runs x minutes + AR/AP items x minutes + sales-tax filings x minutes + a fixed review block. Minimum fee = hours x target rate + software. Recommended = minimum x (1 + buffer). Walk-away = hours x (target x floor percent) + software. Cleanup = months x monthly minutes x slow-down multiplier x rate x (1 + buffer), with no software charge. Roster effective hourly = (fee - software) / hours; raise needed = hours x target + software - fee, if positive.

## What it is not

Not tax, accounting or legal advice, not a fee survey, and no warranty. It ignores scope disputes, seasonality, and any professional or licensing rule that applies to you. Your engagement letter comes first.

## Privacy

No network call, no account, no analytics vendor. The browser page works on typed or pasted values locally and never uploads them. Anonymous feature counts (`price_run`, `roster_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
