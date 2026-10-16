# Actions Cache Poisoning Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for an actions/cache (or actions/cache/save) write reachable from a pull_request_target/workflow_run trigger, and for an unscoped restore-keys fallback on actions/cache or actions/cache/restore -- the two patterns behind the May 2026 T…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-cache-poisoning-check@main
  with:
    path: .
```

Runs [`ventures/actions-cache-poisoning-check/check.py`](../../../../ventures/actions-cache-poisoning-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-cache-poisoning-check/
