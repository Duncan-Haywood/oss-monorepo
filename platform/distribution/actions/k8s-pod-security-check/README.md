# K8s Pod Security Check (GitHub Action)

Free, read-only heuristic scanner that reads your own Kubernetes Pod, Deployment, StatefulSet, DaemonSet, Job and CronJob manifests for risky pod and container security settings -- privileged containers, host namespaces, hostPath volumes such as docker.sock, SYS_ADMIN or ALL capabilities, running a…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/k8s-pod-security-check@main
  with:
    path: .
```

Runs [`ventures/k8s-pod-security-check/check.py`](../../../../ventures/k8s-pod-security-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/k8s-pod-security-check/?ref=gh-action
