# RDS Instance Rightsizer

Find the RDS and Aurora instances that are bigger (or smaller) than their CloudWatch numbers justify,
get the next class in the same family, a Graviton saving for x86 classes, the monthly difference
(Multi-AZ doubles the instance price) and the `aws rds modify-db-instance` command. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/rds-instance-rightsizer/

```
aws rds describe-db-instances --output json > rds.json
node cli.mjs analyze rds.json metrics.csv --commands
node cli.mjs analyze instances.csv --cpu-target 60 --mem-reserve 25 --prices my-prices.json
node cli.mjs analyze instances.csv --fail-on warn     # CI: exit 1 on over-provisioned / under pressure
node cli.mjs analyze instances.csv --json
node cli.mjs classes                                  # the embedded class table and prices
```

Inputs (any mix): CSV rows
`db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,freeable_mem_gb_min,connections_p95[,count]`
(header optional, may name a subset of columns; CPU in percent, memory in GiB) and/or the JSON from
`aws rds describe-db-instances`. The JSON supplies engine, class, Multi-AZ and storage; a CSV with the same
`db_identifier` supplies the CloudWatch numbers.

A smaller class is recommended only if it keeps projected p95 CPU at or under 70% (`--cpu-target`), keeps
20% of its memory freeable at the observed peak (`--mem-reserve`), allows the connection p95 under 80% of its
default `max_connections` (memory / 9531392), and, for burstable t classes, keeps average CPU under the
class's credit baseline. A Graviton equivalent (t3 to t4g, m5/m6i to m6g, r5/r6i to r6g) is added at the
same size for MySQL, PostgreSQL, MariaDB and Aurora.

| rule | level | meaning |
| --- | --- | --- |
| `cpu-saturated` | error | p95 CPU at or above 95% |
| `memory-pressure` | error | freeable memory under half the reserve (default 10% of the class) |
| `cpu-high` | warn | p95 CPU at or above 85% |
| `memory-low` | warn | freeable memory under the reserve |
| `connections-near-max` | warn | connections p95 over 80% of the default max_connections |
| `burstable-credit-risk` | warn | t-class average CPU above its credit baseline |
| `over-provisioned` | warn | a smaller class in the family fits with headroom |
| `no-larger-fit` | warn | under pressure and no larger class in the family clears the targets |
| `graviton-available`, `memory-bound`, `multi-az-priced`, `unknown-class`, `no-metrics`, `no-memory-data` | info | context |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input.

The printed command waits for the next maintenance window; `--apply-immediately` adds that flag. Either way a
class change restarts the instance (several minutes single-AZ, a one-to-two minute failover Multi-AZ).

## What it is not

A recommendation from metrics, not a bill. Metrics must be sampled over a representative period, including
peaks. Prices are approximate us-east-1 on-demand list prices for single-AZ MySQL/PostgreSQL-style instances,
editable with `--prices`; Aurora, Oracle, SQL Server, reserved instances, storage and I/O are not modelled.
Not advice, no warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
