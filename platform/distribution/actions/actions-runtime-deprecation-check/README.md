# Actions Runtime Deprecation Check (GitHub Action)

Free, read-only CLI that scans GitHub Actions workflows for first-party actions (checkout, setup-node, cache, upload-artifact and more) pinned to majors that run on end-of-life or ageing Node runtimes or that GitHub has shut down, printing file, line and the major to move to; zero dependencies, no…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-runtime-deprecation-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-runtime-deprecation-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-runtime-deprecation-check/check.py`](../../../../ventures/actions-runtime-deprecation-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-runtime-deprecation-check/?ref=gh-action
