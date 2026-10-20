# Neon Bill Estimator

Estimate a monthly Neon (serverless Postgres) bill from the usage numbers in your console, and
see which changes cut it most, each with a dollar figure — before the invoice.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/neon-bill-estimator/

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 200      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set storage_gb=200 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`compute_cu_hours`, `storage_gb`, `history_gb`, `extra_branches`, `egress_gb`.

Levers ranked by saving: scale to zero, rightsize autoscaling, delete stale branches, shorten the restore window, prune storage, cut data transfer.
Each is computed alone under an assumption printed next to it (editable with
`--assume`), so the savings **overlap and are not additive**.

`--minimum USD` sets the plan floor (default $5). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on the numbers you give, at approximate public usage-based list prices
dated in the source (`PRICES_AS_OF`) and editable with `--prices` (including the
included allowances and the monthly minimum); check
<https://neon.com/pricing>. It cannot see your plan, region, projects,, contract or real invoice. Not a bill reader, a guarantee or advice. Not
affiliated with Neon or Databricks.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
