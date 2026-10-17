# Kubernetes Resource Limits Check

A free tool that reads Kubernetes workload YAML (`Pod`, `Deployment`,
`StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, `CronJob`) and reports every
container missing a memory limit, memory request, CPU request, or
ephemeral-storage limit, plus any request set above its own limit — sourced
from Kubernetes' own documented eviction, OOM, and admission-validation
behaviour, not guessed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/k8s-resource-limits-check/

**What it is not:** a live-cluster scanner, an admission controller, or a
capacity-planning tool that tells you the *right* number. It checks that a
manifest's declared requests/limits are present and internally consistent,
deterministically, from the YAML you already have — no kubeconfig, no API
server call, no model.

After using this, you can now **find the container that would take its node
down under memory or disk pressure before it ships**, which used to take
**a node going into memory or disk pressure in production, the kubelet or
kernel OOM killer acting on whichever process it scored worst — not
necessarily the one that grew — and someone tracing the incident back to a
container that had never had a `resources.limits.memory` line at all.**

## Why this exists

A container with no memory limit can grow without bound; nothing in
Kubernetes stops it until the node itself runs short, at which point the
kernel's OOM killer or the kubelet's node-pressure eviction acts — and
neither is scoped to only the container responsible. The same shape applies
to `ephemeral-storage` (a filled local disk evicts pods across the node, not
only the one that filled it) and to a missing CPU/memory *request* (ranked
worst in eviction ordering regardless of actual usage). A CPU *limit*, once
set, is a genuine trade-off rather than an obvious safety rail — the kernel's
CFS bandwidth controller can throttle a bursty container even on an
otherwise idle node (tracked upstream as
[kubernetes/kubernetes#67577](https://github.com/kubernetes/kubernetes/issues/67577)) —
so this tool reports a set CPU limit as informational rather than as a
problem to fix. See [the docs page](why-a-missing-resource-limit-takes-down-a-node.html)
for the full mechanism behind each check, and
[how this differs from Polaris](vs-polaris.html) — short version: Polaris is
broader and deployed, this is one narrow question with nothing to install.

## Try it without installing anything

[`index.html`](index.html) reads workload YAML you load or paste entirely in
the browser and reports every finding. No fetch happens from the page
itself, so nothing you load ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the file you name — no
network call, ever.

```sh
node cli.mjs check manifests.yaml                    # list every finding; exit 0 (informational)
node cli.mjs check manifests.yaml --fail-on-risk     # exit 1 if any container is left unbounded or invalid
node cli.mjs check manifests.yaml --fail-on-risk --json
```

Wire it into CI before a deploy:

```yaml
- name: Check resource requests/limits
  run: |
    helm template ./chart > rendered.yaml
    node cli.mjs check rendered.yaml --fail-on-risk
```

**Scope, stated plainly.** This checks six things per container: a missing
memory limit, memory request, CPU request, or ephemeral-storage limit; a set
CPU limit (informational); and a request above its own limit for CPU or
memory. It reads plain YAML text via a small dependency-free parser (see
`yaml.mjs`) — not Helm template expressions or Kustomize patches; render
those first. It cannot tell you the *right* number for a request or limit,
only whether one is present and consistent — pair it with `kubectl top` or
your own metrics for that.

## Disclaimers

This tool reports what a manifest declares against a fixed set of documented
Kubernetes mechanisms. It is **not** infrastructure, security, or
capacity-planning advice, and it is not a guarantee that a clean report
means your resource settings are correctly sized. Verify against your own
workload's actual usage, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `file_loaded`) in `localStorage` only — never transmitted,
never tied to your manifest. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs yaml.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checking engine,
CLI, and browser page are built and tested; no external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
