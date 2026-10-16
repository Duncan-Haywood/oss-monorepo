# Lot Split Calculator

A buyer offers one price for the whole estate, storage unit or liquidation pallet. Listing the items one by
one looks like more money until fees, shipping and your own hours come out. Paste the lines and the offer
and see what splitting really nets, which lines are worth listing and which should be sold on in bulk, a
stress test at lower sell-through, and the hourly value of your time at which you should take the offer.
Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/lot-split-calculator/

```
node cli.mjs split lot.csv --offer 260 --cost 150 --rate 15
cat lot.csv | node cli.mjs split - --json
```

Input: rows of `item,qty,price,sell_through,shipping,minutes[,note]`. See `fixtures/lot.csv`.

## How it decides

Listed value of a line = qty x (sell-through x (price x (1 - fee) - shipping) + (1 - sell-through) x price x
bulk%) - qty x minutes/60 x hourly rate. Bulk value = qty x price x bulk%. Lines do not interact, so the best
mix is the larger value on every line; the tests check it against every list-or-bulk combination on 300
random lots. The break-even hourly rate is found by bisection.

## What it is not

Not a forecast: it compares options using numbers you supply. Sales tax, storage, returns and renegotiation
risk are not modelled. Not financial, tax or legal advice, no warranty.

## Privacy

No network call, no account, no analytics vendor. The browser page analyses pasted text locally and never
uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
