# Upstash Redis Bill Estimator

Estimate a monthly Upstash Redis bill from the usage numbers in your console, compare
pay-as-you-go with the fixed plans (with the crossover command volume), and see which changes cut it most, each with a dollar figure — before the invoice.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/upstash-redis-bill-estimator/

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 100      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set storage_gb=5 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`commands_m` (millions per month), `storage_gb`, `bandwidth_gb`.

Levers ranked by saving: pipeline and batch, cache hot keys, stop polling, set TTLs, shrink payloads, and switch to a fixed plan when one is cheaper.
Each is computed alone under an assumption printed next to it (editable with
`--assume`), so the savings **overlap and are not additive**.

Fixed plans are a dated table in `engine.mjs` (`DEFAULT_FIXED_PLANS`); their bandwidth and connection limits are not modelled. Exit 1 when `--budget` (monthly USD, pay-as-you-go estimate) is exceeded; 2 on bad input.

## What it is not

Arithmetic on the numbers you give, at approximate public list prices
dated in the source (`PRICES_AS_OF`, written from memory, not re-fetched) and editable with `--prices` (including the
free allowances); verify on <https://upstash.com/pricing/redis>. It cannot see your plan, region, databases, add-ons, contract or real invoice. Not a bill reader, a guarantee or advice. Not
affiliated with Upstash or Redis Ltd.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
