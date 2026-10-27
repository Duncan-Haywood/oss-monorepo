# Actions Continue On Error Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for jobs and steps with a literal continue-on-error: true -- places where a failure still leaves the run green -- zero-dependency CLI, no upload, no network calls.

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-continue-on-error-check@main
  with:
    path: .
```

Runs [`ventures/actions-continue-on-error-check/check.py`](../../../../ventures/actions-continue-on-error-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-continue-on-error-check/?ref=gh-action
