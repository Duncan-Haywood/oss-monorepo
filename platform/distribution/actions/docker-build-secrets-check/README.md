# Docker Build Secrets Check (GitHub Action)

Free, read-only checker that scans a repository's Dockerfiles for build-time secret exposure -- ENV or ARG instructions whose name looks like a secret, and COPY/ADD of well-known credential files (.env, id_rsa, .npmrc, .aws/credentials) into the build context -- and recommends a BuildKit RUN --moun…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/docker-build-secrets-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `docker-build-secrets-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/docker-build-secrets-check/check.py`](../../../../ventures/docker-build-secrets-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/docker-build-secrets-check/?ref=gh-action
