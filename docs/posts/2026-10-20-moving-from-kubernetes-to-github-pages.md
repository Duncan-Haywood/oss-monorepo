---
title: "Moving a static site off a self-hosted Kubernetes cluster to GitHub Pages"
date: 2026-10-20
description: "Why we retired a two-server k3s cluster and serve a static tool catalogue from a gh-pages branch, and the traps in a branch-published Pages site."
tags: [github-pages, kubernetes, hosting, ai-agents]
---

# Moving a static site off a self-hosted Kubernetes cluster to GitHub Pages

This repository publishes a catalogue of free browser tools. AI coding agents
build and ship nearly all of it, with an owner steering a few hours a week.
For about a month in late summer the catalogue had two homes: GitHub Pages,
and a small self-hosted Kubernetes (k3s) cluster on two rented servers. On 1
October the owner deleted the servers. GitHub Pages, published from a
`gh-pages` branch, is now the only host.

This post is the record of why, drawn from
[`portfolio/hosting/README.md`](../../portfolio/hosting/README.md),
[`portfolio/ledger/infra_state.yaml`](../../portfolio/ledger/infra_state.yaml),
[`platform/pages/publish-branch.sh`](../../platform/pages/publish-branch.sh),
[`platform/ci/pages_state.py`](../../platform/ci/pages_state.py) and
[`gitops/README.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/492de39bfc6e99b4daa538bd478814e2bd1c3d47/gitops/README.md) (removed with the tree on 2026-10-30).

## How there came to be a cluster

On 25 August the hosting decision was simple: browser calculators and landing
pages go on GitHub Pages, which costs nothing and leaves no server to patch.
Anything with a process would go on a rented server.

Pages did not turn out to be one switch away. It was not yet enabled. The
repository was private then, and on the free plan Pages does not serve a
public site from a private repository. And the workflow that builds the
Pages artifact needs a GitHub Actions runner, which the account had run out
of (see [When GitHub Actions runners run out](2026-10-20-github-actions-runner-starvation-runner-id-0.md)).

So on 29 August the assembled site also went to the cluster. The design in
`gitops/README.md` was one k3s cluster on two machines, a 12 vCPU / 24 GB
control-plane node and a 2 vCPU / 4 GB node reserved for agent jobs, with
Argo CD syncing manifests from `main`. By 2 and 3 September the domain's
front page and 174 tools were served from a mirror of the build committed
under `gitops/prod/`. It needed no Actions run and no Pages setting. For a
while it was the only surface a stranger could reach.

## 4 September: every route down at once

On 4 September the cluster's Kubernetes API stopped answering, and the same
evening Actions starvation returned. The ledger lays out why that was worse
than two separate outages:

| Route to a public site | Depended on |
|---|---|
| Pages via the Actions workflow | a runner |
| Self-hosted CI runners (the fallback for starved Actions) | the cluster, because they ran as pods in it |
| Repairing the cluster | SSH, plus a runner to dispatch the repair |

The insurance against metered CI lived inside the thing whose repair needed
CI. On 6 September the owner's own browser confirmed the domain refused
connections.

## The fourth route: publish a branch

`publish-branch.sh` was written to depend on neither a runner nor the
cluster. It builds the site in the agent's own session, commits the output as
an orphan commit to `gh-pages`, and force-pushes it. GitHub's managed Pages
builder serves that branch. The owner's one action was Settings → Pages →
"Deploy from a branch". That setting was granted on 6 September.

GitHub's managed builder is not an Actions workflow and does not draw on the
metered minutes, so it kept deploying throughout the starvation window. That
is why the branch route stayed up while everything in `.github/workflows/`
starved.

The trade-off is that a committed snapshot does not rebuild itself. After a
change to a served page lands, a session runs:

```
python3 platform/ci/pages_state.py --require-current
CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh
```

A workflow can do this on every merge, but only once the owner sets
`PAGES_BRANCH_PUBLISH=true`. For a catalogue of static client-side
calculators, a stale copy still computes the same answers, so the cost is
low, but it is real.

## 1 October: retired, not down

The owner deleted both servers, the k3s cluster, Argo CD and the self-hosted
runner host. The ledger rows for them now say "RETIRED ... permanent", and the
standing rule is not to connect to their old addresses at all, because a
released address can be reassigned to a stranger. The domain's DNS records
still point at the released address; repointing them to Pages is an open
owner action, since it involves the registrar.

Anything with a server process now needs a new hosting decision from the
owner. Static surfaces need nothing.

## Traps we hit along the way

**The force-push that deletes the custom domain.** When an owner sets a
custom domain in Pages settings, GitHub commits a `CNAME` file to the serving
branch and reads the domain back from it. A publisher that force-pushes an
orphan commit built from `dist/` deletes that file, and GitHub reads the
absence as "domain removed". The workflow stays green and prints "pushed".
The script was fixed on 6 September to carry `CNAME` forward. An explicitly
empty `PAGES_CNAME=` is now the only way to drop a domain, so it cannot happen
by omission, and tests pin that behaviour.

**A probe that inverted the truth.** On 10 September a session tested the
servers' ports with a raw socket from its sandbox. The web ports looked open
and the rest timed out, which reads like a cluster serving again. It was the
agents' egress proxy answering on the two ports it handles. A sandbox could
measure nothing about those hosts, and the reading that looked like recovery
was the one to distrust most.

**Prose that went stale both ways.** The hosting README once told sessions
for days that the catalogue was live while nothing listened, and later that
it was dark while Pages served it. The rule now is to prefer a reading (a run
id, a conclusion, a date) over prose, and `pages_state.py` exists to take
one.

## What the site looks like today

`pages_state.py` asks only what the plain repository object and the workflow
list can answer, because the Pages API endpoints are refused from an agent
session. Its reading for this post, on 20 October:

| Field | Reading |
|---|---|
| repository | public |
| has_pages | true |
| source | branch |
| deployed | GitHub's managed builder succeeded on `gh-pages` at 02:11 UTC on 20 October |
| snapshot | stale: 12 changed files on `main` feed the build since it was published |
| indexing | the site is served from a subpath, so crawlers never read its `robots.txt` and its sitemap is not auto-discovered |

Two caveats it states itself. No agent session can fetch the `github.io` site
directly, because the egress proxy refuses it, so an unauthenticated page
load has not been observed from here. And the subpath robots problem is an
owner fix: a `robots.txt` at the user-site root that names the sitemap, or a
custom domain.

## One leftover cost

The mirror committed for the cluster outlived it. Measured on 16 October in
[`docs/parallel-agents.md`](../../docs/parallel-agents.md), 84% of pull
requests since 2 October touched `gitops/prod/`, the regenerated copy for an
origin that no longer exists. It was the biggest single source of merge
conflicts between parallel agents. A count on 20 October finds 73 files under
`gitops/prod/front-door/`, but the regeneration step is still on the pre-merge
checklist, and removing it is the owner's call.

## What we would tell another small team

- For static tools, a `gh-pages` branch is the route with the fewest moving
  parts. It needs no runner, no cluster and no secret.
- Do not put your CI fallback inside the infrastructure it is meant to rescue.
- If you force-push a generated branch, list the files GitHub writes to it.
- Retire infrastructure explicitly, and delete what it leaves behind in the
  tree.

This describes one repository's hosting, not professional infrastructure
advice; check GitHub's current Pages documentation before relying on it.
