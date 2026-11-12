# Systemd Unit Hardening Check (GitHub Action)

Free, read-only checker that reads your own systemd .service files with their NAME.service.d drop-ins merged in systemd order, for services running as root, missing sandboxing (NoNewPrivileges, ProtectSystem, ProtectHome, PrivateTmp, PrivateDevices, kernel protection, system call and socket filters…

```yaml
- uses: actions/checkout@v4
- uses: duncan-haywood/oss-monorepo/platform/distribution/actions/systemd-unit-hardening-check@main
  with:
    path: .
```

For a stable pin, replace `@main` with a full commit SHA, or with a `systemd-unit-hardening-check-v<version>` tag from this repository's Releases once one exists (portfolio/distribution/versions.json has the current version).

Runs [`ventures/systemd-unit-hardening-check/check.py`](../../../../ventures/systemd-unit-hardening-check/check.py) (MIT, stdlib-only Python, no network calls). Docs: https://duncan-haywood.github.io/oss-monorepo/systemd-unit-hardening-check/?ref=gh-action
