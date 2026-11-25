# Dependency Confusion Check (GitHub Action)

Free, read-only checker for two configuration shapes behind the 2021 dependency-confusion incidents (Alex Birsan''s research against Apple, Microsoft, PayPal, Netflix, Uber, and Tesla): pip --extra-index-url usage, and an unscoped npm dependency name while .npmrc sets a private default registry --…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/dependency-confusion-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `dependency-confusion-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/dependency-confusion-check/check.py`](../../../../ventures/dependency-confusion-check/check.py) (FSL-1.1-MIT, stdlib-only Python, no network calls). Docs: https://marisstella.app/dependency-confusion-check/?ref=gh-action
