# Databricks Cluster Cost Advisor

Why is your Databricks bill so high? Paste one row per cluster and see what each costs in dollars,
scheduled work paying the all-purpose DBU rate, clusters that never terminate, and long
autotermination tails, each with the setting to change. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/databricks-cluster-cost-advisor/

```
node cli.mjs analyze clusters.csv
cat clusters.csv | node cli.mjs analyze -
node cli.mjs analyze clusters.csv --terminate 60 --fail-on warn   # CI: exit 1 on any waste
node cli.mjs analyze clusters.csv --json --prices prices.json     # {"allPurpose": 0.55, "jobs": 0.15}
```

Input: rows of `cluster,kind,dbu_month,autotermination_minutes|never[,dbu_per_hour[,starts_month]]`,
where kind is `interactive`, `scheduled` (all-purpose cluster running scheduled work) or `jobs`.
DBUs come from `system.billing.usage`.

| rule | level | meaning |
| --- | --- | --- |
| `scheduled-on-all-purpose` | warn | DBUs x (all-purpose rate - Jobs rate) on work that already runs on a schedule |
| `always-on-cluster` | warn | autotermination off and DBUs near around-the-clock; saving assumes ~220 working hours a month |
| `no-autotermination` | warn | autotermination off on an all-purpose cluster |
| `autotermination-too-long` | warn | starts x (autotermination - target) idle minutes x DBU/hour, capped at 80% of the cluster's DBUs |
| `one-cluster-dominates` | info | one cluster is >= 50% of the total |

## What it is not

Savings are a model, not a measurement. DBU prices ($0.55 all-purpose, $0.15 Jobs) are illustrative
and editable. Cloud VM cost, SQL warehouses, serverless and Photon are not modelled. A shorter
autotermination means a cold restart. Not a bill, not advice, no warranty. Databricks is a trademark
of its owner, used only to describe what the tool reads.

## Privacy

No network call, no workspace access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
