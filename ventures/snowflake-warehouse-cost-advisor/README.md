# Snowflake Warehouse Cost Advisor

Why is your Snowflake bill so high? Paste one row per warehouse and see what each costs in dollars,
the idle tail a long `AUTO_SUSPEND` is billing, idle and never-suspending warehouses, and a bounded
right-sizing note, each with the `ALTER WAREHOUSE` command. Browser page or zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/snowflake-warehouse-cost-advisor/

```
node cli.mjs analyze warehouses.csv
cat warehouses.csv | node cli.mjs analyze -
node cli.mjs analyze warehouses.csv --suspend 120 --fail-on warn   # CI: exit 1 on any waste
node cli.mjs analyze warehouses.csv --json --prices prices.json    # {"credit": 2.5}
```

Input: rows of `warehouse,size,credits_month,auto_suspend_seconds|never[,queries_month[,avg_query_seconds[,resumes_month]]]`.
Credits come from `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY`, size and AUTO_SUSPEND from `SHOW WAREHOUSES`.

| rule | level | meaning |
| --- | --- | --- |
| `idle-warehouse` | warn | credits billed but no queries; the whole bill is the saving |
| `never-suspends` | warn | AUTO_SUSPEND off and credits near around-the-clock for its size |
| `auto-suspend-too-long` | warn | resumes x (AUTO_SUSPEND - target) idle seconds, capped at 80% of the warehouse's credits |
| `oversized-for-short-queries` | info | size L or bigger averaging short queries; upper bound, not counted in the saving |
| `one-warehouse-dominates` | info | one warehouse is >= 50% of the total |
| `many-tiny-warehouses` | info | three or more warehouses each under 20 credits a month |

## What it is not

The AUTO_SUSPEND saving is a model (each resume followed by one idle tail), not a measurement. The
credit price ($3.00) is illustrative and editable. Storage, serverless features, cloud-services
credits and multi-cluster warehouses are not modelled. A shorter AUTO_SUSPEND means a colder cache.
Not a bill, not advice, no warranty. Snowflake is a trademark of its owner, used only to describe
what the tool reads.

## Privacy

No network call, no Snowflake access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
