# HVAC Repair Price Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/hvac-repair-tier-price-calculator/>

**Find your true cost per billable hour as an HVAC contractor, price a service call at Good, Better and Best with tiered parts and equipment markup and a callback reserve, set a diagnostic fee, and see what an average call earns at your mix of customer choices against quoting one repair price.** Browser page, no install; a price-book builder exports CSV.

After using this, you can put three priced options in front of a customer from your own costs, which used to be one number copied from a competitor.

## Your numbers, not advice

Every value is a number you type, and the starting numbers are invented examples, not market rates or a customer mix anyone measured. Check your local licensing, refrigerant-handling and written-estimate rules. Not affiliated with any trade association, licensing board, equipment manufacturer, supplier or software vendor.

## How it computes

True cost per billable hour = (wage x (1 + burden) x paid hours + van + insurance + tools + overhead) / billable hours. Each option's price = ((hours x true cost / (1 - target margin)) + parts + marginal tiered markup) / (1 - callback reserve), rounded up. Diagnostic fee = (travel + diagnostic hours) x true cost / (1 - target margin), rounded up, credited against an approved repair. An average call weights the three prices by the share of approvals choosing each, after the share of calls that end at the diagnostic fee.

## What it is not

Not business, tax, legal, licensing or mechanical-code advice, not a market price guide, and no warranty. It ignores sales tax, permits, financing fees, manufacturer rebates, refrigerant regulation and local rules on how an estimate must be written.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`, `pricebook_exported`, `share_link_copied`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured. The share link puts your inputs in the URL fragment, which is not sent to any server.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
