# Feature Flag Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/feature-flag-pricing-calculator/>

Price PostHog, Flagsmith and ConfigCat side by side at your monthly
flag-request volume (thousands), see the 12-month spend under your growth rate, and find the volumes where the
cheapest provider changes — before you build on one.

```
node cli.mjs compare --kreq 300 --growth 6
node cli.mjs compare --kreq 800 --provider posthog --budget 300   # CI gate: exit 1 over budget
node cli.mjs crossover
node cli.mjs compare --kreq 300 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (free K req, plans of
`{k, price}`, overage per K req). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on a request volume at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores seats, projects, experimentation add-ons, SSO, contracts
and each vendor's own definition of a billable request or config download, so it compares the per-request line
and does not forecast an invoice. Not a quote, a guarantee or advice. Not affiliated with any
vendor named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
