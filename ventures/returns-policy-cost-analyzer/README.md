# Returns Policy Cost Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/returns-policy-cost-analyzer/>

What do returns really cost your store? Paste orders with refunds (category, subtotal, amount refunded,
optional return label) and see what each return costs you, which product categories lose money once
returns are counted, and whether a return fee or restocking fee would pay against free returns. Browser
page or zero-dependency CLI.

```
node cli.mjs analyze orders.csv
cat orders.csv | node cli.mjs analyze -
node cli.mjs analyze orders.csv --margin 45 --out-ship 6.5 --resale 70 --days 90
node cli.mjs analyze orders.csv --deterrence 0.5 --drag 5 --json --fail-on warn   # CI: exit 1 on a loss-making category
```

Input: rows of `category,subtotal,refund[,return_label]`; refund is 0 or blank for orders that were kept.

## The model

A kept order earns `subtotal x margin - card fee - outbound shipping`. A refunded order loses the sale
and adds the return label, handling, the card fee (processors generally keep it), the outbound shipping,
and the cost of goods that cannot be resold. Two behaviours cannot be read from past orders, so they are
inputs:

- **deterrence** (`--deterrence`, default 1): a fee worth 10% of the order removes 10% x deterrence of that
  order's returns (they keep the item), capped at 60%.
- **drop-off** (`--drag`, default 3%): the share of would-be buyers who do not check out when a return fee
  worth 10% of the order is shown; bigger fees scale it up, smaller ones down.

Output: cost per return and in total, a per-category table, and for each of seven policies ($3/$5/$8/$12
fee, 10/15/20% restocking fee) the profit change vs free returns and the drop-off at which it breaks even.
The "safest" policy minimises the worst shortfall against the best choice over a grid of both assumptions.

| rule | level | meaning |
| --- | --- | --- |
| `returns-cost` | info/warn | total and per-return cost; warn when returns remove a quarter of margin |
| `high-return-category` | warn | a category returning at 1.5x the overall rate (and at least 15%) |
| `category-loses-money` | error | a category with a negative profit once returns are counted |
| `better-policy` | warn | a fee beats free returns by at least $100/year at the assumptions |
| `robust-policy` | info | a different policy is never as far behind the best across the grid |
| `thin-data` | warn | fewer than 100 orders or 15 returns |

## What it is not

Not a forecast. Exchanges, store credit, repeat purchases, lifetime value, fraud and competitors are not
modelled. Margin and resale rate are yours to supply. Return-fee rules differ by country; check them
before changing a policy and test a change for a few weeks before keeping it. Not advice, no warranty.
Store and platform names are trademarks of their owners, used only to describe where numbers come from.

## Privacy

No network call, no store access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
