# Docker Base Image Pin Check (GitHub Action)

Free, read-only checker that scans a repository's Dockerfiles and flags every FROM line referencing a base image by a mutable tag (node:18, python:3.11-slim, or bare latest) instead of a pinned content digest (@sha256:...), printing the docker buildx imagetools inspect command to look up the digest…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/docker-base-image-pin-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `docker-base-image-pin-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/docker-base-image-pin-check/check.py`](../../../../ventures/docker-base-image-pin-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/docker-base-image-pin-check/?ref=gh-action
