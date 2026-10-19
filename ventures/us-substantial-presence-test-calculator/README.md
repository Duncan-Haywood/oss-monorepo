# US Substantial Presence Test Calculator

**List your days in the United States and see the 183-day weighted count (this year, plus a third of last year, plus a sixth of the year before), how many more days you can spend this year and stay under the test, the date you crossed it, and what a planned trip would do.** Browser page, no install.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/us-substantial-presence-test-calculator/

After using this, you know whether your own dates make you a US tax resident under the substantial presence test and how much slack a trip leaves, which used to be an IRS Publication 519 worksheet and a spreadsheet of date arithmetic.

## Alternatives today, and what this does differently

The IRS worksheet in Pub. 519 and generic "183 day" web calculators take three yearly totals. Tax-software questionnaires need an account. This takes dated stays, leaves out exempt days (students, teachers, medical, crew, commuter, transit), accepts a year's total where you have no dates, and answers the planning question: **the most days you can spend this year**, and what a planned trip does. It runs in your browser and uploads nothing.

## Your dates, not tax advice

Every value is something you type. Any part of a day in the US counts as a day. The calculator does not decide whether you are an exempt individual, whether a tax treaty or the closer connection exception (Form 8840) applies, whether the first-year choice is open to you, or what you owe. Check IRS Publication 519 or a tax professional. Not affiliated with the IRS or any tax preparer.

## How it computes

Each stay is expanded to a day set; days marked `exempt` (or `medical`, `crew`, `commuter`, `transit`) are removed even where they overlap a normal stay. Days per calendar year give `c` (test year), `p1` (year before) and `p2` (two years before). The test is met when `c >= 31` and `c + p1/3 + p2/6 >= 183`, computed in sixths (`6c + 2p1 + p2 >= 1098`) so 182.83 never rounds up to 183. The most days that keep you under is `max(30, floor((1097 - 2p1 - p2) / 6))`. The date you crossed is the first day the running count of the test year meets both conditions.

`engine.mjs` has the pure functions; `node --test` runs the suite (Pub. 519's 120/120/120 example, exact boundaries, an independent recount).

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`count_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
