# PPP Pricing Table Generator

Turn one base price into a **purchasing-power (PPP) price table** for about 50 countries, for an
app or SaaS sold worldwide. Set how strongly prices follow local price levels, a floor, a cap,
rounding (.99, whole, ends-in-9), optionally collapse the table into a few price tiers, and get the
**regional discount groups** to type into a payment processor. A what-if models revenue against
your own traffic mix and shows the extra conversion each discount has to win to break even.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ppp-pricing-table-generator/

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no network
calls. [`how-to-set-regional-prices-for-software.html`](how-to-set-regional-prices-for-software.html)
explains the method in plain words.

After using this, an indie developer can see what each country should pay and which discounts need
how much extra conversion to be worth it, which used to mean a spreadsheet of guessed percentages.

## CLI

```
node cli.mjs 29 --tiers 4
node cli.mjs 49 --strength 0.6 --floor 0.4 --format csv
node cli.mjs 29 --traffic shares.txt --elasticity 1.5
```

Node 18+, no dependencies.

## Limits

Price-level indexes are rounded estimates (US = 100) in the spirit of World Bank ICP price levels;
override them with your own. No currency conversion, no tax. The revenue model uses one price
elasticity for every market and is a what-if, not a forecast. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
