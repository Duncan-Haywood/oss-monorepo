# Object Storage Pricing Calculator

Price Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces and Hetzner Object Storage
side by side at the GB you store and the GB you serve each month, see the 12-month spend under your
growth rate, and find the egress level where the cheapest provider changes — before you build on one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/object-storage-pricing-calculator/

```
node cli.mjs compare --stored-gb 5000 --egress-gb 8000 --growth 5
node cli.mjs compare --stored-gb 5000 --egress-gb 8000 --provider s3 --budget 300   # CI gate: exit 1 over budget
node cli.mjs crossover --stored-gb 2000
node cli.mjs compare --stored-gb 5000 --egress-gb 8000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (base fee, storage per GB,
included storage, egress per GB, included egress, free-egress-to-stored ratio, minimum billed storage).
Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on two typed volumes at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores request and operation fees, minimum-retention charges,
other regions, contracts and each provider's fair-use terms, so it compares the storage and egress
lines and does not forecast an invoice. Not a quote, a guarantee or advice. Not affiliated with any
provider named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
