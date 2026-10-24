# Thumbtack Lead ROI Calculator

**Find what a job really costs you in lead fees and quoting time, the close rate you need to break even, and the most one lead can cost before it loses money.** Enter paid leads per month, price per lead and credits for bad leads, minutes per quote and what your time is worth, your close rate, and the job you usually win. Browser page, no install.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/thumbtack-lead-roi-calculator/

After using this, you know whether to answer fewer, better-matched leads or more of them, and whether a pricier lead can plausibly pay at your close rate.

## Your numbers, not advice

Every value is a number you type. Lead prices, credit rules and fees belong to the platform and change, so all are editable. Not affiliated with Thumbtack.

## How it computes

Cost per lead = price x (1 - credited share) + minutes/60 x hourly value. Cost per job won = cost per lead / close rate. Earned per job = job value x (1 - job cost share) x repeat multiplier. Break-even close rate = cost per lead / earned per job. Lead price ceiling = (close rate x earned per job - time cost) / (1 - credited share).

## What it is not

Not financial, tax, legal or business advice, and no warranty.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
