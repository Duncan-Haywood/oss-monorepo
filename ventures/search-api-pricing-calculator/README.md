# Search API Pricing Calculator

Price Algolia, Meilisearch Cloud, Typesense Cloud, Elastic Cloud and a self-hosted engine side by side
at the records you index and the searches you serve each month, see the 12-month spend under your
growth rate, and find the query volume where the cheapest option changes — before you build on one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/search-api-pricing-calculator/

```
node cli.mjs compare --records-k 500 --searches-k 2000 --growth 5
node cli.mjs compare --records-k 500 --searches-k 2000 --provider algolia --budget 300   # CI gate: exit 1 over budget
node cli.mjs crossover --records-k 200
node cli.mjs compare --records-k 500 --searches-k 2000 --prices prices.json --json
node cli.mjs providers
```

Volumes are in thousands (`--records-k 500` = 500,000 records). `--prices` is a JSON object of provider
overrides merged over the defaults (base fee, per-1K-records and per-1K-searches overage, included
records and searches). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on two typed volumes at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable; overage rates are rough. Typesense Cloud and Elastic Cloud are
modelled as a flat fee with a record allowance, and self-hosting includes an editable allowance for
your own time. It ignores record size, indexing operations, replicas, regions, vector/AI search and
contracts, so it compares the records and searches lines and does not forecast an invoice. Not a
quote, a guarantee or advice. Not affiliated with any provider named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
