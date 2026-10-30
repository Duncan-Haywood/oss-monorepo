# Docker Compose Security Check (GitHub Action)

Free, read-only heuristic scanner that reads your own docker-compose.yml for risky settings -- privileged containers, the Docker socket mounted, host networking, SYS_ADMIN or ALL capabilities, databases published on every interface, literal secrets in environment, :latest images, unconfined seccomp…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/docker-compose-security-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `docker-compose-security-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/docker-compose-security-check/check.py`](../../../../ventures/docker-compose-security-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/docker-compose-security-check/?ref=gh-action
