# Docker Compose Security Check (GitHub Action)

Free, read-only heuristic scanner that reads your own docker-compose.yml for risky settings -- privileged containers, the Docker socket mounted, host networking, SYS_ADMIN or ALL capabilities, databases published on every interface, literal secrets in environment, :latest images, unconfined seccomp…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/docker-compose-security-check@main
  with:
    path: .
```

Runs [`ventures/docker-compose-security-check/check.py`](../../../../ventures/docker-compose-security-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/monorepo-projects/docker-compose-security-check/?ref=gh-action
