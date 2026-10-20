# Cow-Calf Breakeven Calculator

**Find what a cow costs you a year, what her calf brings in, the calf price per hundredweight you need to break even, and how hay price, weaning weight and calves weaned move it.** Browser page, no install.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cow-calf-breakeven-calculator/

After using this, you know your margin per cow and across the herd, the price, weight or weaning rate at which you break even, and which cost line to attack first.

## Your numbers, not advice

Every value is a number you type. Prices, costs and weaning rates are yours to check. Not affiliated with any cattle association or market.

## How it computes

Cost per cow = hay (tons x price) + supplement + pasture + health + bull + labor + other + replacement, where replacement = replacement rate x (replacement cost - cull cow sale value). Revenue = calves weaned per cow exposed x weaning weight / 100 x calf price. Breakeven price = cost / hundredweight weaned per cow exposed.

## What it is not

Not financial, tax, legal, veterinary or business advice, and no warranty. It ignores timing of cash, retained ownership, heifer premiums, death loss after weaning and taxes.

## Privacy

No network call, no account, no analytics vendor. Anonymous feature counts (`calculate_run`, `example_loaded`) live in local storage only and can be switched off on the page; Do Not Track and Global Privacy Control are honoured.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
