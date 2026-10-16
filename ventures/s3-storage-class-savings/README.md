# S3 Storage Class Savings

Will an S3 lifecycle rule actually save money? Reads an **S3 Inventory** CSV and reports the
**net 12-month saving** of each transition after the costs people forget. Browser page or
zero-dependency CLI.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/s3-storage-class-savings/

```
node cli.mjs analyze inventory.csv
node cli.mjs analyze inventory.csv --retrieval-pct 5 --region-multiplier 1.1
node cli.mjs analyze inventory.csv --fail-on warn --waste-threshold 250   # CI: exit 1 above $250/month avoidable
node cli.mjs analyze inventory.csv --json --prices prices.json --as-of 2026-10-01
```

Input columns: `Bucket, Key, Size, LastModifiedDate, StorageClass`, optionally
`IntelligentTieringAccessTier`, `IsLatest`, `IsDeleteMarker` (a header row lets them come in any
order; quoted CSV is handled; non-current versions and delete markers are counted and left out).
Decompress `.csv.gz` reports first.

It prints current monthly cost by class, Standard objects by age (0-30, 30-90, 90-180, 180-365,
365+ days), and for Standard-IA (day 30), Glacier Instant Retrieval (day 90), Glacier Flexible
Retrieval (day 90), Deep Archive (day 180) and Intelligent-Tiering (day 30) the net saving with and
without a size filter, then a ready-to-paste lifecycle configuration for the best one.

What is charged against each saving: per-object transition request fee; 128 KB minimum billable size
(Standard-IA, Glacier Instant); 40 KB per-object overhead (Glacier Flexible, Deep Archive); minimum
storage duration (30/90/180 days) on the share you say is deleted early; Intelligent-Tiering's
per-object monitoring fee, with objects under 128 KB neither monitored nor tiered; retrieval cost on
the percentage of bytes you say is read each month (default 1%).

**The size filter.** Objects under 128 KiB can lose money on transition. The recommended rule uses
`"ObjectSizeGreaterThan": 131071` because the comparison is strict, so this keeps every object of
128 KiB or more.

| rule | level | meaning |
| --- | --- | --- |
| `avoidable-waste` | warn | best net saving exceeds `--waste-threshold` (default $100/month) |
| `savings-available`, `no-net-saving` | info | best net saving at or below the threshold / none |
| `small-objects-lose-money` | info | Standard objects under 128 KiB, with the cost per million |
| `minimum-duration`, `noncurrent-ignored`, `undated-rows`, `unpriced-class`, `no-standard-objects` | info | |

Exit 1 only with `--fail-on warn` and a warning; 2 on bad input or no rows.

## What it is not

Estimates, not a bill. List prices (us-east-1, dated in the output) are editable with `--prices`,
scaled by `--region-multiplier`, and ignore free tier, volume tiers, discounts, data transfer and
Glacier retrieval request fees. An inventory lists what exists, not what is read, so retrieval and
early deletion are assumptions. Savings count only objects already past each action's age; objects
that age in later are not projected. Test a rule on one prefix first. No warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page reads the file
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
