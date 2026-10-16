# Actions Checkout Credentials Check (GitHub Action)

Free, read-only, zero-dependency CLI that scans GitHub Actions workflow YAML for actions/checkout steps without persist-credentials: false, ranking the ones in jobs that also upload artifacts or caches (the artipacked pattern) first, with the exact fix; no network calls.

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-checkout-credentials-check@main
  with:
    path: .
```

Runs [`ventures/actions-checkout-credentials-check/check.py`](../../../../ventures/actions-checkout-credentials-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-checkout-credentials-check/
