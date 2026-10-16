# S3 Storage Class Advisor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/s3-storage-class-advisor/>

Is your S3 bucket in the wrong storage class? Paste one row per bucket or prefix (GB stored,
object count, GB read back, GETs per month) and see the monthly cost in Standard, Standard-IA,
Intelligent-Tiering and Glacier Instant Retrieval. Browser page or zero-dependency CLI.

```
node cli.mjs analyze rows.csv
cat rows.csv | node cli.mjs analyze - --current standard
node cli.mjs analyze rows.csv --fail-on warn      # CI: exit 1 when a class change would save >=20%
node cli.mjs analyze rows.csv --json --prices prices.json
```

Input: `name,size_gb,objects,read_gb_per_month,gets_per_month[,avg_life_days]` — S3 Storage Lens or an
S3 Inventory rollup gives all of it. The model includes the 128 KB minimum billable object size,
per-GB retrieval fees, 30/90-day minimum durations and the Intelligent-Tiering monitoring fee.

| rule | level | meaning |
| --- | --- | --- |
| `move-to-<class>` | warn | another class saves >= 20% and >= $5 a month for that row |
| `cheap-class-trap` | info | a cheaper class is only cheaper before small-object or short-life billing |
| `retrieval-heavy`, `class-fine` | info | |

Exit 1 with `--fail-on warn` when any row warns; 2 on bad input or no rows.

## What it is not

Intelligent-Tiering is modelled (data not read this month is cold), not measured. List prices are
illustrative and dated (us-east-1) and ignore free tier, volume tiers, transition/PUT charges, other
regions, Glacier Flexible/Deep Archive and One Zone-IA (prices editable with `--prices`). Not a bill,
not advice, no warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses pasted text
locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
