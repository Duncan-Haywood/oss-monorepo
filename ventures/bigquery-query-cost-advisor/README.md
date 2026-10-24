# BigQuery Query Cost Advisor

Why is your BigQuery bill so high, and would Editions (slot-hours) be cheaper than on-demand? Paste one row
per recurring query group and see what each costs on-demand, what the same work costs in slot-hours, which
group dominates, which single runs are expensive enough to deserve a `--maximum_bytes_billed` cap, and which
repeat large scans need partitioning, clustering or a materialized view. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/bigquery-query-cost-advisor/

```
node cli.mjs analyze queries.csv
cat queries.csv | node cli.mjs analyze -
node cli.mjs analyze queries.csv --guardrail-usd 2 --fail-on warn   # CI: exit 1 on any warning
node cli.mjs analyze queries.csv --json --prices prices.json
```

Input: rows of `query_group,runs_per_month,gb_billed_per_run[,slot_hours_per_run]`. From
`INFORMATION_SCHEMA.JOBS_BY_PROJECT`: `COUNT(*)`, `AVG(total_bytes_billed)/1e9` and
`AVG(total_slot_ms)/3600000`, grouped by label, user or query hash.

| rule | level | meaning |
| --- | --- | --- |
| `editions-cheaper` | warn | slot-hours cost less than on-demand on paper; prints a capped-reservation command |
| `expensive-single-run` | warn | one run bills >= $5 (editable); prints a `bq query --maximum_bytes_billed` cap |
| `on-demand-cheaper` | info | stay on-demand |
| `slot-hours-missing` | info | Editions not compared because slot hours were not supplied |
| `group-dominates` | info | one group is >= 40% of scanned-bytes cost |
| `repeated-large-scan` | info | >= 100 runs a month at >= 100 GB each |

## What it is not

The Editions figure is a floor: it bills exactly the slot-hours used, ignoring autoscaler granularity
(50-slot steps, one-minute minimum) and idle baseline slots. Prices are illustrative and dated (US
multi-region), editable with `--prices`. Storage, streaming, BI Engine and commitments are not modelled.
Changing billing model affects every query in a project: pilot with a capped reservation. Not a bill, not
advice, no warranty.

## Privacy

No network call, no Google Cloud access, no account, no analytics vendor. The browser page analyses pasted
text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
