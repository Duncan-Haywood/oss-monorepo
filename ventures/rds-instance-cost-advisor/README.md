# RDS Instance Cost Advisor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rds-instance-cost-advisor/>

Why is your RDS bill so high? Paste one row per instance and see what each costs in dollars, Multi-AZ
you pay double for outside production, io1 provisioned IOPS that a gp3 volume covers, x86 classes with
a cheaper Graviton twin and idle instances, each with the `aws rds` command. Browser page or
zero-dependency CLI.

```
node cli.mjs analyze instances.csv
cat instances.csv | node cli.mjs analyze -
node cli.mjs analyze instances.csv --fail-on warn                   # CI: exit 1 on any waste
node cli.mjs analyze instances.csv --json --prices prices.json      # {"hourly": {"db.m5.large": 0.15}}
```

Input: rows of `instance,class,engine,multi_az,storage_type,storage_gb[,provisioned_iops[,avg_cpu_pct[,env]]]`.
Rows come from `aws rds describe-db-instances` and CloudWatch `CPUUtilization`.

| rule | level | meaning |
| --- | --- | --- |
| `idle-instance` | warn | average CPU under 5%; the instance compute is the saving |
| `multi-az-nonprod` | warn | Multi-AZ on dev/test/staging/qa/uat/sandbox; single-AZ halves the bill |
| `io1-to-gp3` | warn | provisioned IOPS inside gp3's baseline (3,000 under 400 GB, 12,000 above); the per-IOPS charge is the saving |
| `graviton-twin` | warn | t3/m5/r5 with a cheaper t4g/m6g/r6g twin for MySQL, MariaDB or PostgreSQL |
| `oversized-for-cpu` | info | CPU under 20% on a large class; upper bound, not counted |
| `reserved-instance-candidate` | info | steady production instance; upper bound, not counted |
| `one-instance-dominates` | info | one instance is >= 50% of the total |

## What it is not

List prices (US East, on-demand, MySQL/MariaDB/PostgreSQL) are illustrative and editable. Aurora, Oracle,
SQL Server, backups, data transfer and existing Reserved Instance or Savings Plan discounts are not
modelled. Class, Multi-AZ and storage changes affect availability and performance: test on a copy first.
Not a bill, not advice, no warranty. Amazon Web Services and Amazon RDS are trademarks of their owner,
used only to describe what the tool reads.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
