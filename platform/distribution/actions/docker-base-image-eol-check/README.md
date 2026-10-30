# Docker Base Image Eol Check (GitHub Action)

Free, read-only checker that scans a repository's Dockerfiles and flags every FROM line whose base image release line (node:18, python:3.9, ubuntu:20.04, ...) has passed its publisher's own end-of-life date, or is due to soon -- using a curated, dated table checked into the tool, never a live looku…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/docker-base-image-eol-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `docker-base-image-eol-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/docker-base-image-eol-check/check.py`](../../../../ventures/docker-base-image-eol-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/docker-base-image-eol-check/?ref=gh-action
