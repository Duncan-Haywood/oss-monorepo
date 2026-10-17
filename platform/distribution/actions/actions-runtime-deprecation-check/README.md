# Actions Runtime Deprecation Check (GitHub Action)

Free, read-only CLI that scans GitHub Actions workflows for first-party actions (checkout, setup-node, cache, upload-artifact and more) pinned to majors that run on end-of-life or ageing Node runtimes or that GitHub has shut down, printing file, line and the major to move to; zero dependencies, no…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-runtime-deprecation-check@main
  with:
    path: .
```

Runs [`ventures/actions-runtime-deprecation-check/check.py`](../../../../ventures/actions-runtime-deprecation-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-runtime-deprecation-check/?ref=gh-action
