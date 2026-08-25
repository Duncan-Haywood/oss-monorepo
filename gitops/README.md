# GitOps (hel1, two nodes)

One k3s cluster. Two existing Hetzner machines. Argo CD syncs this
directory after the one-time bootstrap.

```
cpx52  ubuntu-24gb-hel1-1   12 vCPU / 24 GB   control-plane
       Argo, ingress, cert-manager, prod, staging, governor CronJob

cpx22  ubuntu-4gb-hel1-1     2 vCPU /  4 GB   tainted dedicated=agents
       Codex Jobs only. maxConcurrent: 1. Hardware, not a suggestion.
```

## Does one box for prod + staging + dev make sense?

Not these two boxes treated as one. The 4 GB machine cannot hold k3s +
Argo + a Codex worker + `marisstella.dev`. The 24 GB machine can hold
the control plane and the products.

One *cluster* does make sense: same API, same Argo, namespaces `prod` /
`staging` / `agents`, AppProjects so agents cannot dest prod or read
prod Secrets, ResourceQuotas so a Job cannot eat the ingress node, and
a taint so Jobs do not schedule next to prod at all.

Split into two clusters when you need to upgrade k3s without touching
`marisstella.dev`, or when agent CPU regularly fights ingress. That is
not today's problem.

`staging` is a namespace on the same node as prod, with a smaller
quota. It is not a second copy of every product.

## Sync model

- Argo Application `root` (the snowflake) points at `gitops/apps`.
- Child Applications: platform helm charts, then `platform` / `prod` /
  `staging` / `agents`.
- Agents are CronJobs / Jobs. GitOps stores the schedule and the spec,
  not eight always-on Codex processes.
- The governor is **suspended** and `enabled: false` until you seal
  tokens and flip both knobs in git.
- Budget counters live in ConfigMap `governor-state`. Argo ignores
  `/data` so a sync cannot reset the 5-hour / weekly accounting. A 429
  (worker exit 42) writes `last_limit_at` and the next ticks sleep.

## What this must not do

- Recreate k3s from Argo (that bricks the node).
- Store `HCLOUD_TOKEN` in the cluster.
- Auto-sync agents committing to the branch they deploy from.
- Bind an Ingress to `marisstella.dev` without an explicit PR that says
  so. The name already points at the cpx52.
