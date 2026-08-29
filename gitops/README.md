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

## The public product site

`prod/portfolio-site.yaml` serves the portfolio's 164 finished static
tools on **`tools.marisstella.dev`**. It is the first thing in this
cluster on a public name.

It builds the site *in the cluster* — two init containers (shallow clone,
then `platform/pages/build.mjs`) writing into an emptyDir that nginx
serves. That is deliberate: it means publishing does not depend on GitHub
Actions, which has failed without a runner on every workflow in this repo
since 2026-08-26, nor on GitHub Pages, which is not enabled. Neither
blocker sits in this path.

A subdomain, not the apex. `marisstella.dev` already resolves to the
cpx52 for something else and ingress-nginx only answers for hosts a rule
names, so the apex keeps whatever serves it today.

### What is still needed to make it live

Four things, all owner actions. Until then Argo syncs the manifests and
the pods crash-loop on the missing secret, which is the intended
fail-closed state.

1. **DNS.** One A record: `tools.marisstella.dev` → `89.167.29.39`.
2. **The clone token.** The repository is private, so the init container
   cannot clone anonymously. Mint a fine-grained token scoped to this one
   repository with **Contents: Read-only** and nothing else, seal it, and
   add it to `prod/kustomization.yaml` — full instructions in
   `prod/secrets/portfolio-repo-token.template.yaml`.
3. **A real ACME contact.** `platform/cert-manager/issuer.yaml` still
   carries `replace-me@duncanhaywood.dev`. Let's Encrypt will refuse to
   register that address, so TLS cannot issue until it is a real mailbox.
   Left as a placeholder here on purpose: which address to hand an
   external certificate authority is the owner's to choose, not an
   agent's to guess.
4. **Flip the issuer, last.** The Ingress ships pointed at
   `letsencrypt-staging` deliberately: Argo syncs this namespace, so the
   Ingress exists before the A record does, and challenges that cannot
   resolve would count against Let's Encrypt limits for a name nobody can
   reach. Once DNS resolves and a staging certificate has issued, change
   the `cert-manager.io/cluster-issuer` annotation to `letsencrypt-prod`
   (and update the test that pins it). Browsers will warn until you do —
   staging is not a trusted root.

### Keeping it current

Pods build from `main` at start-up, so a merged venture does not appear
until something restarts them — and Argo will not, because this manifest
does not change when a venture does. The `portfolio-site-refresh`
CronJob does a `rollout restart` nightly at 04:17 UTC. Its Role is
namespaced and narrowed by resource name: it can restart this one
Deployment and touch nothing else in `prod`.

For an immediate rebuild, bump `portfolio/rebuild-nonce` on the
Deployment.

## What this must not do

- Recreate k3s from Argo (that bricks the node).
- Store `HCLOUD_TOKEN` (Read or Write) in the cluster.
- Store an OpenAI Admin API key in the cluster (it can raise spend limits).
- Auto-sync agents committing to the branch they deploy from.
- Bind an Ingress to `marisstella.dev` without an explicit PR that says
  so. The name already points at the cpx52. (`tools.marisstella.dev` is
  bound, deliberately and on the record, by `prod/portfolio-site.yaml` —
  a subdomain, which cannot take traffic from the apex.)
