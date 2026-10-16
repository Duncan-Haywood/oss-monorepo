# Free Shipping Threshold Optimizer

What should your free-shipping minimum be? Paste past orders (subtotal, optional shipping cost) and see
what every round threshold would earn against what you do today, the checkout drop-off at which each
one breaks even, and the threshold that loses least if your guesses are wrong. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/free-shipping-threshold-optimizer/

```
node cli.mjs analyze orders.csv
cat orders.csv | node cli.mjs analyze -
node cli.mjs analyze orders.csv --current 75 --margin 45 --fee 5.95 --days 30
node cli.mjs analyze orders.csv --top-up 15 --drag 5 --json --fail-on warn   # CI: exit 1 if a better minimum exists
```

Input: rows of `subtotal[,shipping_cost]`, subtotal before shipping and tax (Shopify orders export: Subtotal).

## The model

For each order, profit is `subtotal x margin - shipping cost`, plus the shipping fee the customer pays when
the order is under the threshold. Two behaviours cannot be read from past orders, so they are inputs:

- **top-up** (`--top-up`, default 25%): the chance an order just under a threshold adds items to reach it,
  fading linearly to zero at `--reach` (default 30%) of the threshold.
- **drop-off** (`--drag`, default 10%): the share of would-be buyers who abandon when charged shipping.
  Past orders are survivors of whatever fee applied to them, so each is scaled by 1/(1-drag) when another
  threshold would have waived that fee.

Output per threshold: profit change vs the current policy, share of orders shipping free, and the drop-off
at which it breaks even. The "safest" threshold minimises the worst shortfall against the best choice over a
grid of top-up and drop-off values.

| rule | level | meaning |
| --- | --- | --- |
| `better-threshold` | warn | a candidate beats the current policy by at least $100/year at the assumptions |
| `robust-threshold` | info | a different threshold is never as far behind the best across the assumption grid |
| `current-threshold` | info | share of orders the current minimum ships free |
| `thin-data` | warn | fewer than 30 orders |

## What it is not

Not a forecast. Returns, repeat purchases, lifetime value, carrier rate changes and competitors are not
modelled. Margin is yours to supply. Test a change on the store for a few weeks before keeping it. Not
advice, no warranty. Store and platform names are trademarks of their owners, used only to describe where
numbers come from.

## Privacy

No network call, no store access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
