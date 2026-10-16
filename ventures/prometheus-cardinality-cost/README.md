# Prometheus Cardinality Cost

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/prometheus-cardinality-cost/>

Find the labels inflating your Prometheus / Grafana Cloud / Datadog-style
metrics bill — from one `/metrics` scrape, before the invoice.

```
curl -s localhost:9100/metrics | node cli.mjs analyze -
node cli.mjs analyze metrics.txt --targets 40
node cli.mjs analyze metrics.txt --targets 40 --max-series 50000   # CI gate
node cli.mjs analyze metrics.txt --json
node cli.mjs analyze metrics.txt --prices prices.json              # your negotiated prices
```

Per metric it reports active series, the label responsible, and the **exact**
number of series removed by dropping each label (computed from the scrape, not
modelled). Rules:

| rule | level | meaning |
| --- | --- | --- |
| `unbounded-label` | warn | label named like `user_id`, `request_id`, `trace_id`, `email`… with more than one value |
| `high-cardinality-label` | warn | label with ≥ `--threshold` (default 50) distinct values |
| `histogram-bucket-multiplier` | info | many buckets over many label combinations |
| over `--max-series` | error | series × `--targets` exceeds your budget |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input.

## What it is not

A calculator over one scrape. It cannot see how many targets you run beyond
the `--targets` you give, label churn over days, recording rules, or how your
vendor counts series. Prices are illustrative and dated in the source, editable
with `--prices`. Not a bill, a guarantee or advice. Dropping a label may break
dashboards or alerts that group by it.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) analyses pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
