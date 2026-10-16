# Vercel Bill Estimator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/vercel-bill-estimator/>

Estimate a monthly Vercel Pro bill from the usage numbers on your dashboard, and
see which changes cut it most, each with a dollar figure — before the invoice.

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 500      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set bandwidth_gb=2000 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`seats`, `bandwidth_gb`, `edge_requests_million`, `function_invocations_million`,
`function_cpu_hours`, `function_memory_gb_hours`, `fast_origin_gb`,
`image_transformations_thousand`, `build_minutes`.

Levers ranked by saving: cache more, block bots, shrink assets, cut image
transformations, skip no-op builds, audit seats, rightsize function memory.
Each is computed alone under an assumption printed next to it (editable with
`--assume`), so the savings **overlap and are not additive**.

Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on the numbers you give, at approximate public Pro-plan list prices
dated in the source (`PRICES_AS_OF`) and editable with `--prices` (including the
included allowances and the monthly usage credit); check
<https://vercel.com/docs/pricing>. It cannot see your plan, regions, spend
limits, contract or real invoice. Not a bill reader, a guarantee or advice. Not
affiliated with Vercel Inc.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
