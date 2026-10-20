# Kubernetes Pod Security Check

A free tool that scans your own Kubernetes manifests (Pod, Deployment,
StatefulSet, DaemonSet, ReplicaSet, Job, CronJob; multi-document `---` files
work) for risky pod and container security settings. Each finding prints
`file:line`, the resource and container, the risk and the exact YAML fix.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/k8s-pod-security-check/

| Type | Severity | What it flags |
| --- | --- | --- |
| `k8s-privileged` | high | `privileged: true` |
| `k8s-host-namespace` | high | `hostNetwork`, `hostPID` or `hostIPC` true |
| `k8s-hostpath-sensitive` | high | hostPath of `/`, `/etc`, `/root`, `/proc`, `/sys`, `/var/lib/kubelet` or docker.sock |
| `k8s-dangerous-capability` | high | `capabilities.add` of ALL, SYS_ADMIN, NET_ADMIN, SYS_PTRACE, SYS_MODULE, DAC_READ_SEARCH |
| `k8s-literal-secret-env` | high | PASSWORD, SECRET, TOKEN, API_KEY set to a literal `value:` (never printed) |
| `k8s-privilege-escalation` | medium | `allowPrivilegeEscalation` true or unset |
| `k8s-runs-as-root` | medium | `runAsUser: 0`, `runAsNonRoot: false`, or neither `runAsNonRoot: true` nor a non-zero `runAsUser` |
| `k8s-hostpath-volume` | medium | any other hostPath volume |
| `k8s-image-latest` | medium | image with no tag or `:latest` |
| `k8s-host-port` | medium | `hostPort` used |
| `k8s-no-security-context` | medium | container with no `securityContext` (reported once instead of four unset findings) |
| `k8s-capabilities-not-dropped` | low | `capabilities.drop` lacks ALL |
| `k8s-writable-root-fs` | low | `readOnlyRootFilesystem` not true |
| `k8s-automount-token` | low | `automountServiceAccountToken` not false |
| `k8s-seccomp-missing` | low | no `seccompProfile` on container or pod, or Unconfined |

Pod-level `securityContext` (`runAsNonRoot`, `runAsUser`, `seccompProfile`) is
honoured for every container in the pod.

**What it is not:** a YAML parser, a full audit, a penetration test or a
compliance claim (CIS, Pod Security Standards or otherwise). It is a heuristic
line scan. It does not expand anchors, Helm templates (files containing `{{`
are skipped; run `helm template` first), Kustomize overlays or flow-style maps,
does not read your cluster's admission policies, RBAC or network policies, and
flags some settings that are deliberate (a node agent may truly need hostPath).
A clean scan means only that these patterns were not found, never that the
workload is secure.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste your
manifest and get every finding. Nothing is uploaded, and the page makes no
network requests. The guide
[`what-is-kubernetes-pod-security.html`](what-is-kubernetes-pod-security.html)
explains each pattern.

## Quickstart (CLI)

```sh
python3 check.py                        # scan *.yaml / *.yml under the current directory
python3 check.py deploy.yaml k8s/       # scan specific files or directories
python3 check.py --format json          # machine-readable
python3 check.py --fail-on-risk         # exit 2 on any medium or high finding
```

Zero dependencies, stdlib only, one file, no network calls. Low findings never
trigger `--fail-on-risk`.

## Disclaimers

Free, best-effort, no warranty. Review each finding yourself and have a
qualified person look at anything that protects valuable data. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes what
the tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only, never
transmitted. Do Not Track and Global Privacy Control are honoured, and a button
on the page turns it off. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` over a fixture
directory and asserts the browser port produces identical findings.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). First visitor channel:
people searching "kubernetes privileged true", "allowPrivilegeEscalation false"
and "hostPath docker.sock kubernetes".
