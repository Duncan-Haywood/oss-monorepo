# Cloudflare Bill Estimator

Estimate a monthly Cloudflare developer-platform bill (Workers, KV, R2) from the usage numbers in your dashboard, and
see which changes cut it most, each with a dollar figure — before the invoice.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/cloudflare-bill-estimator/

```
node cli.mjs template > usage.csv                 # product,usage CSV to fill in
node cli.mjs estimate usage.csv
cat usage.csv | node cli.mjs estimate - --budget 100      # CI gate: exit 1 over budget
node cli.mjs estimate usage.csv --set r2_storage_gb=200 --json
node cli.mjs estimate usage.csv --prices prices.json --assume assumptions.json
```

`usage.csv` is `product,usage` (header optional, `#` comments allowed):
`workers_requests_m`, `workers_cpu_m_ms`, `kv_reads_m`, `kv_writes_m`, `r2_storage_gb`, `r2_class_a_m`, `r2_class_b_m` (requests, operations and CPU-ms are in **millions**).

Levers ranked by saving: cache at the edge, trim CPU time, cache hot KV keys, skip redundant KV writes, expire R2 objects, batch R2 writes, cache R2 reads.
Each is computed alone under an assumption printed next to it (editable with
`--assume`), so the savings **overlap and are not additive**.

`--minimum USD` sets the plan floor (default $5). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on the numbers you give, at approximate public usage-based list prices
dated in the source (`PRICES_AS_OF`) and editable with `--prices` (including the
included allowances and the monthly minimum); check
<https://developers.cloudflare.com/workers/platform/pricing/>. It cannot see your plan, add-ons, contract or real invoice. Not a bill reader, a guarantee or advice. Not
affiliated with Cloudflare.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) calculates locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
