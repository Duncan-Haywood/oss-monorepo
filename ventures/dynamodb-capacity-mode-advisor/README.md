# DynamoDB Capacity Mode Advisor

Is your DynamoDB table on the wrong capacity mode? Paste the consumed read/write capacity
from CloudWatch and see the monthly cost on-demand, provisioned with autoscaling and
provisioned at a fixed peak. Browser page or zero-dependency CLI.

**Live tool:** https://marisstella.app/dynamodb-capacity-mode-advisor/

```
node cli.mjs analyze metrics.csv
cat metrics.csv | node cli.mjs analyze - --period 300 --current-rcu 400 --current-wcu 100
node cli.mjs analyze metrics.csv --fail-on warn      # CI: exit 1 when a switch would save >=20%
node cli.mjs analyze metrics.csv --json --prices prices.json
```

Input: rows of `timestamp,read_units,write_units`, the **Sum** of `ConsumedReadCapacityUnits` and
`ConsumedWriteCapacityUnits` per period (default one hour). Rows with ISO or epoch timestamps are
sorted by time, and a period with no row between the first and last is counted as zero, because
CloudWatch leaves out periods with no traffic (idle hours before the first or after the last row cannot
be seen). Provisioned beats on-demand above
about 29% average utilisation at list prices; autoscaling targets 70%.

| rule | level | meaning |
| --- | --- | --- |
| `current-capacity-throttles` | error | your `--current-rcu/--current-wcu` is below the rate in some periods |
| `switch-capacity-mode` | warn | another mode saves >= 20% and >= $5 a month |
| `autoscaling-ramp-risk` | warn | traffic rose faster than the previous capacity allowed for |
| `period-mismatch` | warn | the rows are spaced differently from the period you set |
| `missing-periods-filled` | info | periods with no row between the first and last timestamp were counted as zero |
| `spiky-reads`, `spiky-writes`, `mostly-idle`, `small-sample`, `capacity-mode-fine` | info | |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input or no rows.

## What it is not

Traffic inside a period is treated as flat, so bursts shorter than the period are invisible; DynamoDB
burst capacity and autoscaling lag are flagged, not simulated. List prices are illustrative and dated, and
ignore free tier, reserved capacity, Standard-IA, region, global tables and backups (editable with
`--prices`). Not a bill, not advice, no warranty.

## Known gaps

Found by quality audit round 84 ([`2026-11-19-dynamodb-capacity-mode-advisor.json`](../../portfolio/quality/audits/2026-11-19-dynamodb-capacity-mode-advisor.json)):

- Fixed 2026-11-25: the window was the number of rows times the period, not the span of the timestamps, so an export with idle hours left out was priced from busy hours only; and rows spaced unlike the period were priced with no warning. Missing periods are now counted as zero and a spacing mismatch raises `period-mismatch` (tests in `engine.test.mjs`).
- Global secondary indexes are not priced; their consumed capacity is a separate metric.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

FSL-1.1-MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
