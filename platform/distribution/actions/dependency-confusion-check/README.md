# Dependency Confusion Check (GitHub Action)

Free, read-only checker for two configuration shapes behind the 2021 dependency-confusion incidents (Alex Birsan''s research against Apple, Microsoft, PayPal, Netflix, Uber, and Tesla): pip --extra-index-url usage, and an unscoped npm dependency name while .npmrc sets a private default registry --…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/dependency-confusion-check@main
  with:
    path: .
```

Runs [`ventures/dependency-confusion-check/check.py`](../../../../ventures/dependency-confusion-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/dependency-confusion-check/
