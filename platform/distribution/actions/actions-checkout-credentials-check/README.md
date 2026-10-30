# Actions Checkout Credentials Check (GitHub Action)

Free, read-only, zero-dependency CLI that scans GitHub Actions workflow YAML for actions/checkout steps without persist-credentials: false, ranking the ones in jobs that also upload artifacts or caches (the artipacked pattern) first, with the exact fix; no network calls.

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-checkout-credentials-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-checkout-credentials-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-checkout-credentials-check/check.py`](../../../../ventures/actions-checkout-credentials-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-checkout-credentials-check/?ref=gh-action
