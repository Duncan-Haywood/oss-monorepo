# k8s-rollout-safety-check

**Will this Kubernetes rollout drop live requests?**

`RollingUpdate` promises that Kubernetes replaces pods gradually. It does not
promise that a pod is *ready* before traffic reaches it, or that it has
*stopped* receiving traffic before it shuts down. Those two gaps are why a
deploy that reports success can still serve a burst of connection errors —
and nothing in `kubectl rollout status` will ever mention it.

This reads a Deployment manifest and reports every place Kubernetes is
permitted to take a pod out of service before it has stopped receiving
requests, or put one into service before it can answer them.

- **Browser:** <https://duncan-haywood.github.io/monorepo-projects/k8s-rollout-safety-check/>
- **CLI:** `node check.mjs` — Node 18+, no dependencies, no install.

It reads YAML and nothing else. No kubeconfig, no API server, no network call
of any kind. That is what makes it safe to run against production manifests in
CI without granting it cluster access: there is none to grant.

## Use

```
node check.mjs                     # scan every .yaml/.yml under the current directory
node check.mjs k8s/production      # one directory, or one file
node check.mjs --format json       # machine-readable
node check.mjs --list-checks       # every check and its severity, before you trust any of it
node check.mjs --fail-on-risk      # exit 2 when a rollout can drop requests
```

Exit codes: `0` clean (or findings without `--fail-on-risk`), `1` a path could
not be read or an argument was invalid, `2` `--fail-on-risk` and at least one
risk-level finding.

Helm and Kustomize users: render first, then check the output.

```
helm template ./chart | node check.mjs /dev/stdin   # or write it to a file
kubectl kustomize overlays/prod > /tmp/prod.yaml && node check.mjs /tmp/prod.yaml
```

## What it checks

Ten checks, at two severities. `--list-checks` prints the same list; it is
generated from `CHECKS` in `engine.mjs`, so it cannot drift from what actually
runs.

**Can drop live requests**

| check | what goes wrong |
| --- | --- |
| `no-readiness-probe` | Ready means "the process started", so the Service routes to a pod that cannot serve yet — on every rollout. |
| `recreate-strategy` | Every pod is terminated before the first replacement starts. Full downtime, by definition. |
| `max-unavailable-all-pods` | `maxUnavailable` resolves to the full replica count, so every pod may be down at once. |
| `no-prestop-hook` | Container shutdown races EndpointSlice removal reaching every kube-proxy and ingress controller. |
| `grace-period-too-short` | `terminationGracePeriodSeconds` is at or below the preStop wait, so SIGKILL lands before the app drains. |
| `pdb-blocks-drain` | A PodDisruptionBudget that can never be satisfied. `kubectl drain` does not fail — it blocks forever. |

**Worth reviewing**

| check | what goes wrong |
| --- | --- |
| `single-replica` | No redundancy against an involuntary disruption, which no rollout strategy helps with. |
| `liveness-equals-readiness` | A slow dependency restarts the container instead of removing it from rotation. |
| `liveness-probe-starts-immediately` | No `startupProbe` and no `initialDelaySeconds`, so a slow boot is killed mid-startup. |
| `no-pdb-found` | Nothing in the checked files budgets these pods against a node drain. |

The relational ones are the point. A manifest with a 30-second preStop hook
and the default 30-second grace period passes any per-field check — it *has* a
hook and it *has* a grace period — and never drains at all, because the grace
clock starts at pod deletion and covers both. Reading the two fields together
is the only way to see it.

## What it deliberately does not do

- **Only `Deployment` and `PodDisruptionBudget`.** StatefulSet, DaemonSet and
  Job rollouts have different ordering semantics; applying Deployment rules to
  them would produce confident wrong answers. Other kinds are reported as
  skipped, never silently dropped.
- **No score.** A score answers "how am I doing?"; the question here is "will
  this break?". 7/10 does not say whether the missing three are the ones that
  drop requests.
- **No network, ever.** Not to a cluster, not to a registry, not for
  telemetry.
- **`yes`/`no` are read as strings**, not booleans. That is YAML 1.2 core
  rather than the YAML 1.1 semantics Kubernetes' own parser applies. No field
  this tool reads is a bare `yes`/`no` in practice, and the difference can only
  make a check abstain, never assert a wrong verdict.

A clean result means these checks found nothing. It is not a guarantee about
your deploy: the tool cannot know how long your app takes to drain, whether
your readiness endpoint tests anything real, or whether the release carries a
backwards-incompatible migration.

## Layout

| file | what it is |
| --- | --- |
| `yaml.mjs` | A small YAML *subset* reader. Anchors, aliases and merge keys throw a named error rather than parsing wrong. |
| `engine.mjs` | Every check. The CLI and the browser page both import it, so the two can never disagree about a verdict. |
| `check.mjs` | The CLI. Argument parsing, directory walking, text and JSON rendering. |
| `usage.mjs` | Anonymous local-storage feature counts. Honours Do Not Track and Global Privacy Control. |
| `index.html` | The browser tool. Imports `engine.mjs` directly — no second implementation. |

```
node --test ventures/k8s-rollout-safety-check/*.test.mjs
```

## What dogfooding caught

Run against this repository's own `gitops/prod` on the day it was written, the
first draft rejected two manifests outright with "anchors and aliases are not
supported". Neither contained an anchor. The guard was a line-wide regex, and
it was matching `schedule: "0 1 * * *"` — a cron expression inside a quoted
string — and `&& mkdir -p` in a shell script inside a block scalar.

`&` and `*` are YAML indicators only in *node position*: the value after a
`key:` or a `- `. A plain scalar may never begin with either, so checking
exactly there is both correct and precise. With the guard narrowed, the same
run read all 10 files cleanly and found a third Deployment the broken parse had
been hiding — along with a missing preStop hook on both public-facing nginx
Deployments.

That is the argument for shipping a checker against manifests you actually
operate: the bug was not in the checks, it was in refusing to read the input,
and no unit test written against tidy fixtures would have found it.

## Licence and support

MIT (`LICENSE`). Free, with the real feature set and no paid tier. If it caught
a rollout that would have dropped requests,
[sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

**No warranty.** Provided as-is, without warranty of any kind. It is not a
production-readiness audit or a guarantee of a zero-downtime deploy, and it
does not replace a qualified professional. Test any suggested change against
your own workload before applying it to production.
