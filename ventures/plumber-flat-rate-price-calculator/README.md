# Plumber Flat-Rate Price Calculator

**Find your true cost per billable hour as a plumber, price any job at a flat rate with tiered parts markup, travel time and your target margin, get a minimum callout price, see how the flat price compares with time and materials when a job runs long, and build a whole price book you can export as CSV.** Browser page, no install.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/plumber-flat-rate-price-calculator/

After using this, you can put a flat-rate price on every job in your book from your own costs, which used to be a guess from a competitor's price list.

## Your numbers, not advice

Every value is a number you type, and the starting numbers are invented examples, not market rates. Prices, costs and times are yours to check. Check your local licensing, permit and written-estimate rules. Not affiliated with any plumbing trade association, licensing board, supplier or software vendor.

## How it computes

True cost per billable hour = (wage x (1 + burden) x paid hours + truck + insurance + tools + overhead) / billable hours. Time charge = hours (on site + travel) x true cost / (1 - target margin). Parts charge = parts cost + marginal tiered markup (each slice of parts cost earns its own percentage). Price = time charge + parts charge, rounded up to the step you choose. Minimum callout = (travel + shortest visit) x true cost / (1 - target margin), rounded up. The time-and-materials comparison re-prices the job at other hours worked, with your clock rate and the same parts charge.

## What it is not

Not business, tax, legal, licensing or plumbing-code advice, not a market price guide, and no warranty. It ignores sales tax, permits, financing, warranty callbacks beyond the margin you set, and local rules on how a price must be quoted.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`, `pricebook_exported`, `share_link_copied`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured. The share link puts your inputs in the URL fragment, which is not sent to any server.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
