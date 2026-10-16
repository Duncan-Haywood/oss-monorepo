# EBS Volume Cost Advisor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ebs-volume-cost-advisor/>

Are your EBS volumes the wrong type? Paste one row per volume and see the cheapest type that still
covers the observed peak (gp2 → gp3, io1 → gp3), the monthly saving, and the live
`aws ec2 modify-volume` command to apply it. Browser page or zero-dependency CLI.

```
node cli.mjs analyze volumes.csv
cat volumes.csv | node cli.mjs analyze -
node cli.mjs analyze volumes.csv --fail-on warn          # CI: exit 1 on any waste or throttling
node cli.mjs analyze volumes.csv --headroom 1.5 --json --prices prices.json
```

Input: rows of `volume,type,size_gb,provisioned_iops,provisioned_mibps,peak_iops,peak_mibps[,state]`.
Type, size, IOPS and throughput come from `aws ec2 describe-volumes`; peaks are the busiest week's
maximum of `VolumeReadOps + VolumeWriteOps` over the period and of `VolumeReadBytes + VolumeWriteBytes`
in MiB/s. `state` is `in-use` (default) or `available` (unattached). Header names remap columns.

| rule | level | meaning |
| --- | --- | --- |
| `peak-exceeds-type-limit` | error | observed peak is above what the type can deliver (e.g. st1 above 500 IOPS) |
| `gp2-burst-dependent` | error / warn | peak above the gp2 baseline (3 IOPS/GB): error at 1,000 GB or more (no burst), warn below |
| `switch-volume-type` | warn | another type is >= 10% and >= $1 a month cheaper (or the current one cannot serve the peak); command shown |
| `unattached-volume` | warn | volume is `available` and billing |
| `io1-to-io2`, `hdd-near-iops-limit`, `volumes-fine` | info | |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input or no rows.

## What it is not

The peak is one number you supply, so a spike shorter than your sampling period is invisible, and gp2
burst-bucket state is modelled only as "peak above baseline". List prices are illustrative and dated
(us-east-1) and ignore snapshots, Savings Plans, other regions, multi-attach and io2 Block Express
above 64,000 IOPS (editable with `--prices`). Not a bill, not advice, no warranty. Change one
non-critical volume first.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
