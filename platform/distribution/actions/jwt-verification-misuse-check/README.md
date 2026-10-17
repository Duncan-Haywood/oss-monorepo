# Jwt Verification Misuse Check (GitHub Action)

Free, read-only heuristic scanner that reads your own JavaScript/TypeScript, Python, Go and Java source for JWT verification misuse -- jwt.decode where verify is needed, signature checks switched off, alg none, unpinned algorithms, ignored expiry, hard-coded or weak secrets, request-controlled keys…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/jwt-verification-misuse-check@main
  with:
    path: .
```

Runs [`ventures/jwt-verification-misuse-check/check.py`](../../../../ventures/jwt-verification-misuse-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/jwt-verification-misuse-check/?ref=gh-action
