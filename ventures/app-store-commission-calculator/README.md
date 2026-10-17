# App Store Commission Calculator

Price Apple's 30% and 15% tiers, Google Play's 15% and 30% tiers, and web checkout via Stripe, Stripe Tax and
Paddle side by side at your monthly app revenue, average in-app price and international share. The cost of
filing sales tax and VAT yourself is counted where you are the seller, so you can see **what you keep** and
the monthly revenue where the cheapest option changes.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/app-store-commission-calculator/

```
node cli.mjs compare --revenue 5000 --price 4.99 --intl 60 --growth 5
node cli.mjs compare --revenue 5000 --provider apple30 --max-fee-pct 20   # CI gate: exit 1 over ceiling
node cli.mjs crossover --price 9.99 --tax 150
node cli.mjs compare --revenue 5000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (`pct`, `fixed`, `intlPct`,
`extraPct`, `mor`). Exit 1 when `--max-fee-pct` is exceeded; 2 on bad input.

## What it is not

Arithmetic on revenue and an average price at approximate public list rates dated in the source
(`PRICES_AS_OF`) and editable. It ignores buyer conversion when payment moves to the web, store eligibility
and link-out rules, payout, currency-conversion and dispute charges, negotiated rates, and your own tax
position. Ask your accountant about tax and read the current store guidelines before moving any payment flow. Not a quote, a guarantee, or tax
advice. Not affiliated with Apple, Google or any provider named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial, legal or tax advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
