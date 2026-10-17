# Pinned Actions Check (GitHub Action)

Free, read-only checker that scans a repository's GitHub Actions workflow files and flags third-party actions referenced by a mutable tag (@v4, @main) instead of a pinned 40-character commit SHA, printing the git ls-remote command to look up the SHA yourself.

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/pinned-actions-check@main
  with:
    path: .
```

Runs [`ventures/pinned-actions-check/check.py`](../../../../ventures/pinned-actions-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/pinned-actions-check/?ref=gh-action
