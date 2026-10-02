# RDS Instance Rightsizer

Find the RDS and Aurora instances that are bigger than their load needs, idle, or at risk of being
too small, with a Graviton and gp3 check, Multi-AZ on non-prod, the monthly saving and ready-to-paste
`aws rds modify-db-instance` commands — from data you already have. Browser page or zero-dependency CLI.

```
aws rds describe-db-instances > describe.json
node cli.mjs analyze describe.json metrics.csv --commands
node cli.mjs analyze instances.csv --prices my-prices.json --target-cpu 50
node cli.mjs analyze instances.csv --fail-on warn     # CI: exit 1 on any warning
node cli.mjs analyze instances.csv --json
node cli.mjs --print-prices > my-prices.json          # the embedded price table, to edit
```

Inputs (any mix, joined by instance id): a CSV with a header
`instance_id,class,engine,multi_az,env,avg_cpu,p95_cpu,min_freeable_gib,max_connections,storage_gib,storage_type,iops`
(CloudWatch `CPUUtilization` average and p95, minimum `FreeableMemory` in GiB, maximum
`DatabaseConnections`), and/or `aws rds describe-db-instances` JSON.

Recommended class = the smallest size in the same family that holds p95 CPU at the target
(60% by default) and peak used memory plus headroom (20% by default). Both are editable.

| rule | level | meaning |
| --- | --- | --- |
| `under-provisioned-cpu` / `-memory` | error | p95 CPU over 80%, or freeable memory under 10% of RAM |
| `idle-instance` | warn | average CPU under 5% and at most 2 connections; snapshot then stop or delete |
| `over-provisioned` | warn | a smaller class in the same family fits the observed load |
| `multi-az-nonprod` | warn | Multi-AZ on an instance that looks non-prod (env column, tag or name) |
| `io1-to-gp3` | warn | io1 provisioned IOPS cost more than gp3 |
| `gp2-to-gp3` | info | often a tie at RDS list prices; gp3 has a higher IOPS baseline |
| `graviton-swap` | info | db.m6g/r6g/t4g lists lower than m5,m6i/r5,r6i/t3 |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input.

## What it is not

An estimate from a snapshot, not a bill. The price table is an editable list-price estimate (about
us-east-1, on-demand, single-AZ MySQL/PostgreSQL) for db.t3, t4g, m5, m6g, m6i, m7g, r5, r6g, r6i and
r7g; reserved instances, Savings Plans, other regions and Oracle/SQL Server licences are not modelled.
Sample a representative period, including your busiest day. Resizing causes a restart or failover:
verify in a non-prod window first. Not advice of record, no warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
