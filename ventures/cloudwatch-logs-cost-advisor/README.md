# CloudWatch Logs Cost Advisor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cloudwatch-logs-cost-advisor/>

Why is your CloudWatch Logs bill so high? Paste one row per log group and see what ingestion and
storage each cost, which groups never expire, which are dead, which are Infrequent Access candidates,
and the `aws logs put-retention-policy` command for each retention worth changing. Browser page or
zero-dependency CLI.

```
node cli.mjs analyze groups.csv
cat groups.csv | node cli.mjs analyze -
node cli.mjs analyze groups.csv --retention 14 --fail-on warn   # CI: exit 1 on any waste
node cli.mjs analyze groups.csv --json --prices prices.json
```

Input: rows of `log_group,stored_gb,retention_days|never,ingested_gb_month[,age_days[,class]]`.
Stored GB, retention and creation time come from `aws logs describe-log-groups`; ingested GB is the
`IncomingBytes` metric summed over 30 days. A group with no `retentionInDays` never expires.

| rule | level | meaning |
| --- | --- | --- |
| `retention-never-expires` | warn | never-expire group; saving estimated from its age when supplied |
| `retention-too-long` | warn | retention longer than the target (default 30 days, snapped to a valid value) saves >= $1/month |
| `dead-group` | warn | nothing ingested this month but data is still stored |
| `ia-class-candidate` | info | Standard group with >= $50/month ingestion; Infrequent Access halves it with fewer features |
| `ingestion-dominates` | info | one group is >= 40% of the total |

## What it is not

Retention savings assume ingestion has been even over a group's life: a model, not a measurement.
List prices are illustrative and dated (us-east-1) and ignore free tier, vended-log tiers, Logs
Insights queries, data protection and other regions (editable with `--prices`). A retention policy
permanently deletes older events: check audit and compliance needs first. Not a bill, not advice,
no warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted
text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
