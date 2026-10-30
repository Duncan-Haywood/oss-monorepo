# Actions Secrets Inherit Check (GitHub Action)

Free, read-only checker that scans GitHub Actions workflow YAML for two documented secrets: inherit risks on a reusable-workflow call: secrets: inherit handed to a workflow hosted in a different repository (code outside your own review process), and secrets: inherit on a job reachable from a pull_r…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/actions-secrets-inherit-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `actions-secrets-inherit-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/actions-secrets-inherit-check/check.py`](../../../../ventures/actions-secrets-inherit-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/actions-secrets-inherit-check/?ref=gh-action
