# Datadog Bill Estimator

Estimate a monthly Datadog bill from your own usage numbers, and see which
changes cut it most, each with a dollar figure — before the invoice.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/datadog-bill-estimator/

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 4000      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set logs_indexed_million=500 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`infra_pro_hosts`, `infra_enterprise_hosts`, `containers`, `custom_metrics`,
`logs_ingested_gb`, `logs_indexed_million`, `logs_retention_days` (3, 7, 15 or
30), `apm_hosts`, `synthetics_api_runs`, `synthetics_browser_runs`, `billing`
(`annual` or `monthly`).

Levers ranked by saving: log exclusion filters, shorter retention, move to
flex/archive, trim custom-metric tags, rightsize hosts, annual billing,
fewer synthetic runs. Each is computed alone under an assumption printed next
to it (editable with `--assume`), so the savings **overlap and are not additive**.

Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on the numbers you give, at approximate public list prices dated in
the source (`PRICES_AS_OF`) and editable with `--prices`; check
<https://www.datadoghq.com/pricing/>. It cannot see your contract, discounts,
how Datadog meters hosts across the month, or your real invoice. Not a bill
reader, a guarantee or advice. Not affiliated with Datadog, Inc.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
