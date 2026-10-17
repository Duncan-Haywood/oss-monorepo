# Actions Permissions Check (GitHub Action)

Free, read-only checker that scans a repository's GitHub Actions workflow files and flags every workflow or job with no explicit `permissions:` block (runs with the ambient repository/organization default GITHUB_TOKEN permissions) or with `permissions: write-all`, printing the exact fix for each fi…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-permissions-check@main
  with:
    path: .
```

Runs [`ventures/actions-permissions-check/check.py`](../../../../ventures/actions-permissions-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/actions-permissions-check/?ref=gh-action
