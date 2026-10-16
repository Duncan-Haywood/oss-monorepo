# Upwork Connects ROI Calculator

**Find what a hire really costs you in Connects and writing time, the win rate you need to break even, and the most Connects one proposal can spend before it loses money.** Enter proposals per month, Connects per proposal and their price, minutes per proposal and what your time is worth, your win rate, and the contract you usually win. Browser page, no install.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/upwork-connects-roi-calculator/

After using this, you know whether to send fewer, better proposals or more of them, and whether paying extra Connects to boost one is plausible at your win rate.

## Your numbers, not advice

Every value is a number you type. Connects prices, the service fee and platform rules belong to the platform and change, so all are editable. Not affiliated with Upwork.

## How it computes

Cost per proposal = Connects x price + minutes/60 x hourly value. Cost per hire = cost per proposal / win rate. Net per hire = contract value x (1 - fee) x repeat multiplier. Break-even win rate = cost per proposal / net per hire. Connects ceiling = (win rate x net per hire - time cost) / price.

## What it is not

Not financial, tax, legal or business advice, and no warranty.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
