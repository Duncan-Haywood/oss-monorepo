# Trade Show ROI Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/trade-show-roi-calculator/>

A booth fee is the small part of the bill. Paste the trade shows and conferences you could exhibit at, with
booth, travel, staff and swag costs and the leads you expect, set your funnel (lead to qualified, qualified to
deal, deal value, margin) and see cost per lead, cost per qualified lead, expected deals, gross profit, ROI and
break-even leads for each show, and the exact set of shows that earns the most under your yearly budget.
Browser page or zero-dependency CLI.

```
node cli.mjs plan shows.csv --lead-qual 30 --close 20 --deal-value 12000 --margin 60 --budget 40000 --json
cat shows.csv | node cli.mjs plan - --budget 40000 --max-per-quarter 2
```

Input: rows of `name,date,booth_fee,travel_lodging,staff_count,staff_days,staff_day_cost,swag_collateral,expected_leads[,note]`.
See `fixtures/shows.csv`.

## How it decides

Cost = booth fee + travel + staff count x staff days x day cost + swag. Expected deals = leads x qualified % x
close %; expected gross profit = deals x deal value x lifetime multiplier x gross margin. Net gain = gross profit
- cost; ROI = net gain / cost. Break-even leads, close rate and deals are what would make net gain zero. The best
set of shows under the yearly budget and optional per-quarter cap is found exactly by branch-and-bound; the tests
check it against trying every subset. It also scores going to every show and buying the cheapest first, and
re-checks the plan with leads cut.

## What it is not

Not a forecast: it compares shows using numbers you supply. Brand awareness, existing-customer meetings and
deals that would have closed anyway are not modelled. Not financial, tax or legal advice, no warranty. You remain
responsible for show contracts, deposits and cancellation terms.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
