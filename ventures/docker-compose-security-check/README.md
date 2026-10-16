# Docker Compose Security Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/docker-compose-security-check/>

A free tool that scans your own `docker-compose.yml` for the settings that hand
a container the host or leak a credential. Each finding prints `file:line`, the
risk and the exact fix.

| Type | Severity | What it flags |
| --- | --- | --- |
| `compose-privileged` | high | `privileged: true` |
| `compose-docker-socket` | high | `/var/run/docker.sock` mounted (read-only does not help) |
| `compose-host-network` | high | `network_mode: host` |
| `compose-dangerous-capability` | high | `cap_add` of `ALL` or `SYS_ADMIN` |
| `compose-exposed-database-port` | high | 5432, 3306, 6379, 27017 or 9200 published on every interface (no `127.0.0.1:` prefix) |
| `compose-literal-secret` | high | `PASSWORD`, `SECRET`, `TOKEN`, `API_KEY` and similar set to a literal value in `environment:` (value never printed) |
| `compose-sensitive-host-mount` | high | host path `/`, `/etc`, `/root`, `/boot`, `/proc` or `/sys` mounted |
| `compose-security-opt-unconfined` | high | `seccomp:unconfined`, `apparmor:unconfined`, `label:disable` |
| `compose-host-namespace` | high | `pid: host` or `ipc: host` |
| `compose-runs-as-root` | medium | `user: root`, `0` or `0:0` |
| `compose-image-latest` | medium | image with no tag or `:latest` |
| `compose-no-restart` | low | service with no `restart:` policy |
| `compose-no-healthcheck` | low | service with no `healthcheck:` |

**What it is not:** a security audit, a YAML parser or a penetration test. It is
a heuristic line scan. It does not expand anchors, `extends`, `include` or
`${VARIABLES}`, does not read long-syntax `ports:` entries, treats any
`healthcheck:` or `restart:` key (even a disabling one) as present, and flags
some settings that are deliberate (a monitoring agent may truly need the Docker
socket). A clean scan means only that these patterns were not found, never that
the stack is safe.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste your
compose file and get every finding. Nothing is uploaded, and the page makes no
network requests. The guide
[`what-is-docker-compose-security.html`](what-is-docker-compose-security.html)
explains each pattern.

## Quickstart (CLI)

```sh
python3 check.py                       # scan compose files under the current directory
python3 check.py compose.yaml deploy/  # scan specific files or directories
python3 check.py --format json         # machine-readable
python3 check.py --fail-on-risk        # exit 2 on any medium or high finding
```

Zero dependencies, stdlib only, one file, no network calls. In a directory walk
it reads files named `docker-compose*.yml/.yaml` and `compose*.yml/.yaml` (a file
named explicitly is always scanned) and skips `node_modules`, `vendor`, `.git`,
`dist`, `build` and virtualenvs. Comments are ignored. Low findings never
trigger `--fail-on-risk`.

## Disclaimers

Free, best-effort, no warranty. Review each finding yourself and have a
qualified person look at anything that protects valuable data. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes what
the tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only, never
transmitted. Do Not Track and Global Privacy Control are honoured, and a button
on the page turns it off. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` over a fixture
directory and asserts the browser port produces identical findings.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). First visitor channel:
people searching "docker compose privileged true", "docker.sock mount security"
and "docker compose postgres port 0.0.0.0".
