# Kubernetes Deprecated API Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/k8s-deprecated-api-check/>

A free tool that reads Kubernetes manifest YAML and reports every
`apiVersion` + `kind` pair that a past Kubernetes release has already
removed, or that a release you name would remove — sourced from Kubernetes'
own [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/),
not guessed.

**What it is not:** a live-cluster scanner, an admission controller, or a
guarantee your manifests survive every future release. It checks a fixed
table of removals Kubernetes has already documented with an exact release
number, deterministically, from the YAML you already have — no kubeconfig,
no API server call, no model.

After using this, you can now **catch a manifest that will fail
`kubectl apply` before you start the cluster upgrade**, which used to take
**the first deploy after the upgrade failing mid-rollout, on a manifest
nobody had touched in years, followed by tracing `no matches for kind "X" in
version "Y"` back to a Deployment or CronJob written before the replacement
API even existed.**

## Why this exists

A removed `apiVersion` is not a warning — the API server stops registering
that group/version for the kind entirely, so `kubectl apply`, a rolling
`helm upgrade`, or a controller's own reconcile loop fails outright. Most
`apiVersion` fields are never revisited after they are first written: copied
from an old example, generated once by a scaffolding tool, or buried inside
a Helm chart nobody has opened since. They work for years, right up until a
managed control plane (EKS, GKE, AKS) is upgraded past the release that
removed them — and the failure lands on the deploy after the upgrade, not
before it.

`pluto` (FairwindsOps) is the established open-source tool for this exact
problem, and it is more capable — live-cluster scanning, Helm-release
introspection, a continuously updated database. It is also a binary you
install, and for cluster or Helm scanning, credentials you grant. This is
the zero-install version of the same underlying check: paste or load YAML,
get a report, with a matching CLI that is a single dependency-free file. See
[the docs page](why-a-manifest-fails-a-kubernetes-upgrade.html) for how
Kubernetes' deprecation policy actually works, and
[how this differs from Pluto](vs-pluto.html) — short version, same question,
different adoption cost.

## Try it without installing anything

[`index.html`](index.html) reads manifest YAML you load or paste entirely in
the browser, optionally against a target Kubernetes version, and reports
every match. No fetch happens from the page itself, so nothing you load ever
leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the file you name — no
network call, ever.

```sh
node cli.mjs check manifests.yaml                        # list every known deprecated/removed API; exit 1 if any found
node cli.mjs check manifests.yaml --target-version 1.25  # exit 1 only if 1.25 would already reject one of them
node cli.mjs check manifests.yaml --target-version 1.25 --strict --json
```

Wire it in right before a cluster upgrade, against a rendered chart or a
manifest repository:

```yaml
- name: Check manifests for APIs Kubernetes 1.25 has removed
  run: |
    helm template ./chart > rendered.yaml
    node cli.mjs check rendered.yaml --target-version 1.25
```

**Scope, stated plainly.** This table lists apiVersion+kind pairs from the
1.16, 1.22, 1.25, and 1.26 removal waves — the ones Kubernetes' own guide
documents with a fixed release number. It does not guess at an in-progress
or future-dated deprecation, and it reads plain YAML text, not Helm template
expressions or Kustomize patches — render those first. See the docs page for
the full breakdown.

## Disclaimers

This tool reports matches against a fixed, sourced table for the manifest
YAML you supplied. It is **not** infrastructure, security, or compliance
advice, and it is not a guarantee that a clean report means every manifest
will apply cleanly on every future Kubernetes release. Verify against
Kubernetes' own release notes for your exact target version, the same as any
free, best-effort tool.

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
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checking engine,
CLI, and browser page are built and tested; no external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
