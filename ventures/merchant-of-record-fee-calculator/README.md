# Merchant of Record Fee Calculator

Price Stripe, Stripe + Stripe Tax, Paddle, Lemon Squeezy and Polar side by side at your monthly revenue,
average sale and international share. The cost of filing sales tax and VAT yourself is counted where the
platform is not the seller, so you can see **what you keep** and the monthly revenue where the cheapest
option changes.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/merchant-of-record-fee-calculator/

```
node cli.mjs compare --revenue 5000 --price 29 --intl 60 --growth 5
node cli.mjs compare --revenue 5000 --provider paddle --max-fee-pct 6   # CI gate: exit 1 over ceiling
node cli.mjs crossover --price 29 --tax 150
node cli.mjs compare --revenue 5000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (`pct`, `fixed`, `intlPct`,
`extraPct`, `mor`). Exit 1 when `--max-fee-pct` is exceeded; 2 on bad input.

## What it is not

Arithmetic on revenue and an average sale at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores payout, currency-conversion, dispute and subscription charges,
negotiated rates, and your own tax position. Whether a merchant of record removes a particular
registration for your business is a question for your accountant. Not a quote, a guarantee, or tax
advice. Not affiliated with any provider named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial, legal or tax advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
