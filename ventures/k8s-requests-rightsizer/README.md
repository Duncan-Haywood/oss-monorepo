# Kubernetes Requests Rightsizer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/k8s-requests-rightsizer/>

Find the containers whose CPU and memory **requests** are far above (or below) what they use,
get a recommended request, the monthly saving, out-of-memory warnings and YAML patches — from
`kubectl` output you already have. Browser page or zero-dependency CLI.

```
kubectl top pod -A --containers > top.txt
kubectl get pods -A -o json > pods.json
node cli.mjs analyze top.txt pods.json --patch
node cli.mjs analyze containers.csv --cpu-headroom 30 --cpu-price 0.04 --mem-price 0.005
node cli.mjs analyze containers.csv --fail-on warn     # CI: exit 1 on over-provisioned / near-limit
node cli.mjs analyze containers.csv --json
```

Inputs (any mix): `kubectl top pod --containers [-A]`, `kubectl get pods -o json`, or CSV rows
`namespace,pod,container,cpu_request,mem_request,cpu_usage_p95,mem_usage_p95,replicas` (optional
`cpu_limit`, `mem_limit`; a bare memory number means MiB). Replicas are counted from the owning
workload and the busiest replica's usage is kept.

Recommended request = usage × (1 + headroom): 20% for CPU, 25% for memory by default, both editable.
Savings = replicas × (request − recommended) × editable list prices ($/vCPU-hr, $/GiB-hr) × 730 h.

| rule | level | meaning |
| --- | --- | --- |
| `oom-risk` | error | memory ≥ 85% of the limit (OOMKill); the patch raises the limit with the request |
| `memory-near-request` | warn | memory ≥ 85% of the request and no limit (first to be evicted) |
| `cpu-throttle-risk` | warn | CPU ≥ 85% of the limit |
| `no-requests` | warn | a request is missing |
| `cpu-/memory-overprovisioned` | warn | usage under 50% of the request (info above that) |
| `cpu-underprovisioned` | info | CPU usage above request plus headroom |

Exit 1 on an error (or any warning with `--fail-on warn`); 2 on bad input.

## What it is not

A recommendation from a snapshot, not a bill. `kubectl top` is one sample, not a p95: usage must be
sampled over a representative period, including peaks, before changing requests. List prices are
illustrative, ignore discounts, bin-packing and node overhead, and are editable. Not advice, no warranty.

## Privacy

No network call, no cluster access, no account, no analytics vendor. The browser page analyses
pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
