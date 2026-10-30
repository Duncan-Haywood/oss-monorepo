# Actions Secret Leak Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for the two documented ways a secret reaches a log or a later step unmasked: a step that transforms (base64/hex/substring) a secret-derived value before it can be printed, and a step that writes a secret-derived value to $GITHUB_ENV/$G…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-secret-leak-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-secret-leak-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-secret-leak-check/check.py`](../../../../ventures/actions-secret-leak-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-secret-leak-check/?ref=gh-action
