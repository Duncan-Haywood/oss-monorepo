# Actions Continue On Error Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for jobs and steps with a literal continue-on-error: true -- places where a failure still leaves the run green -- zero-dependency CLI, no upload, no network calls.

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-continue-on-error-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-continue-on-error-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-continue-on-error-check/check.py`](../../../../ventures/actions-continue-on-error-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-continue-on-error-check/?ref=gh-action
