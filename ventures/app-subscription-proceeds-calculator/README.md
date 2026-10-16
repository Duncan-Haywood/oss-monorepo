# App Subscription Proceeds Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/app-subscription-proceeds-calculator/>

**Find what a subscription charge really leaves after store fees, tax and refunds, what a subscriber is worth at your churn, how long payback takes, and what a web checkout would change.** Enter price, store fee (first year and after), refunds, monthly churn and cost to acquire a subscriber. Browser page, no install.

After using this, you know whether your acquisition cost pays back, how much of the answer is the fee tier versus retention, and what the most you can spend per subscriber is for a 12-month payback.

## Your numbers, not advice

Every value is a number you type. Store rates, small-business programs and rules on linking to a web checkout belong to the stores, differ by country and change, so all are editable. Not affiliated with Apple or Google.

## How it computes

Net per charge = price / (1 + tax) x (1 - refunds) x (1 - store fee), with the first-year fee for months 1-12 and the later fee after. Value per subscriber = sum over the horizon of survival x net, where survival = (1 - churn)^month. Payback = first month the running total reaches the cost to acquire. Web checkout net = price without tax x (1 - refunds) - (price x percent fee + fixed fee).

## What it is not

Not financial, tax, legal or business advice, and no warranty. It ignores trials, annual plans' upfront cash timing, currency effects and tax remittance.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
