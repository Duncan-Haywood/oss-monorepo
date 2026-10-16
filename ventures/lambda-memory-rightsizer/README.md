# Lambda Memory Rightsizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/lambda-memory-rightsizer/>

Find the AWS Lambda memory size that minimises cost without a latency regression — from
the `REPORT` lines already in your CloudWatch Logs. Browser page or zero-dependency CLI.

```
aws logs tail /aws/lambda/my-fn --since 1d | node cli.mjs analyze - --invocations 5000000
node cli.mjs analyze logs.txt --cpu-bound 0.8 --arch arm
node cli.mjs analyze logs.txt --fail-on warn      # CI: exit 1 on over-provisioned / near-limit
node cli.mjs analyze logs.txt --json --prices prices.json
```

It reports peak memory vs configured, duration p50/p95/p99, cold-start share, and the cheapest
memory size whose modelled p50 stays within `--max-slowdown` (default 1.25x), at 0%, your
`--cpu-bound` share (default 0.5) and 100% CPU-bound.

| rule | level | meaning |
| --- | --- | --- |
| `out-of-memory-risk` | error | peak memory ≥ 97% of configured |
| `memory-near-limit` | warn | peak memory ≥ 90% of configured |
| `memory-overprovisioned` | warn | peak < 50% of configured and a cheaper size fits the latency cap |
| `faster-is-cheaper`, `cold-start-heavy`, `try-arm64`, `mixed-memory-sizes`, `small-sample` | info | |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input or no REPORT lines.

## What it is not

Duration at another size is a **model** (CPU share ∝ memory up to ~1,769 MB), not a measurement;
confirm with AWS Lambda Power Tuning. List prices are illustrative and dated, ignore free tier,
tiering, provisioned concurrency and region, and are editable with `--prices`. Not a bill, not
advice, no warranty.

## Privacy

No network call, no AWS access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
