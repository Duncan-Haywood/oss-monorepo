# Card Grading Submission Picker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/card-grading-submission-picker/>

Grading fees, shipping and weeks of waiting eat the premium on most cards. Paste your cards (what each would sell for raw
and at each grade, and your own chance of each grade) and get which to send to a grader and at which fee tier, which to
sell raw, the exact chance of a 10 each card needs to be worth sending, the downside, and, under a grading budget or a
cards-per-submission limit, the exact best subset to send. Pokemon, baseball, basketball, football, Magic and any other
card; PSA, BGS, CGC, SGC or any grader whose fees you enter. Browser page or zero-dependency CLI.

```
node cli.mjs pick cards.csv --budget 400 --max-cards 20 --ship 8
cat cards.csv | node cli.mjs pick - --tiers my-tiers.csv --json
node cli.mjs --example-tiers > my-tiers.csv
```

Input: rows of `name,raw,v10,v9,v8,v7_or_lower,p10,p9,p8[,note]`. See `fixtures/cards.csv`. `p10` may be a word
(`sharp`, `clean`, `fair`, `worn`) for an illustrative default chance table. Fee tiers are `name,fee,max_declared_value,days`.

## Your estimates, not a price guide

Every value, grade chance, fee and turnaround is a number you type. The tool knows no card prices, reads no population
report, scrapes nothing and predicts no grade. **The built-in fee table is an example, not any grader's current price
list: replace it before you rely on the answer.** The condition table is a generic guess, not population data.

## How it decides

Selling raw nets the raw value less the marketplace fee (percent plus a fixed fee). Grading nets, per grade, the slab's
sale less the same fees, discounted for the turnaround (annual rate x days / 365), less the grading fee and shipping and
insurance; the grading fee is the cheapest tier whose declared-value limit covers the card's best case (no tier covering
it is flagged, not guessed). Expected net weights each grade by your chance of it (the remainder is 7 or lower). The
uplift is graded minus raw. The break-even chance of a 10 is the closed-form p10 at which uplift is zero with p9 and
p8 held fixed. The downside is the chance, on your odds, of ending below selling raw, and the worst case against raw.
With a budget or card limit the best subset is found exactly by dynamic programming over non-dominated (spend, gain)
labels per card count; the tests check it against every subset.

## What it is not

Not a forecast, a price guide, an authenticity opinion or financial advice, and no warranty. It ignores price moves while
cards are away, loss or damage in transit, grader acceptance rules, crossover and regrade strategies, and what a slab will
really sell for. Outbound shipping to the buyer is left out on both sides.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never uploads it.
Anonymous feature counts (`pick_run`, `example_loaded`) live in local storage only and can be switched off on the page;
Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
