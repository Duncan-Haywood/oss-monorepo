# GPU Training Pricing Calculator

Price an H100, A100, L40S or RTX 4090 workload on RunPod, Lambda, Vast.ai, CoreWeave, AWS, Google
Cloud and Modal side by side at your busy GPU-hours and real utilisation, see the 12-month spend
under growth, and find the busy hours a month above which buying the card beats renting.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/training-gpu-pricing-calculator/

```
node cli.mjs compare --gpu h100 --hours 200 --utilization 60 --growth 5
node cli.mjs compare --gpu a100 --gpus 4 --hours 300 --provider aws --budget 2000   # CI gate: exit 1 over budget
node cli.mjs compare --gpu rtx4090 --hours 120 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults, e.g.
`{"runpod":{"rates":{"h100":2.49}}}`. Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on typed hours at approximate on-demand list prices dated in the source (`PRICES_AS_OF`)
and editable. It ignores spot and reserved discounts, egress, regions, instance shapes, contracts and
availability, so it compares hourly lines and does not forecast an invoice. Not a quote, a guarantee
or advice. Not affiliated with any provider named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
