# systemd Unit Hardening Check

A free tool that reads your own systemd `.service` files, with their
`NAME.service.d/*.conf` drop-ins merged the way systemd applies them, and lists
the settings that hand the machine to a buggy service: running as root, no
sandbox, secrets in `Environment=`, binaries in writable directories,
`curl | sh` on every start, near-root capabilities. Each finding prints
`file:line`, the risk and the fix, and `--drop-in` writes a starter hardening
override with only the lines the unit is missing.

**Live tool:** https://marisstella.app/systemd-unit-hardening-check/
· **Guide:** [`systemd-service-hardening-explained.html`](systemd-service-hardening-explained.html)

**Who it is for:** anyone who writes their own units to run a self-hosted app,
API, worker or bot on a Linux server, and teams that keep unit files in a
repository or a configuration-management template and want a check before
they deploy.

| Type | Severity | What it flags |
| --- | --- | --- |
| `svc-literal-secret` | high | `PASSWORD`, `TOKEN`, `SECRET`, `API_KEY` and similar set to a literal in `Environment=` (value never printed; `_FILE`, `%d/...` and booleans skipped) |
| `svc-exec-from-writable-dir` | high | an `Exec*=` binary under `/tmp`, `/var/tmp` or `/dev/shm`, or under `/home` in a root service |
| `svc-pipe-to-shell` | high | `curl` or `wget` piped into a shell in an `Exec*=` line |
| `svc-dangerous-capability` | high | CAP_SYS_ADMIN, CAP_SYS_MODULE, CAP_SYS_PTRACE, CAP_SYS_RAWIO, CAP_DAC_OVERRIDE, CAP_DAC_READ_SEARCH, CAP_BPF or CAP_SETUID in `AmbientCapabilities=` or a (non-`~`) `CapabilityBoundingSet=` |
| `svc-read-write-root` | high | `ReadWritePaths=/` |
| `svc-runs-as-root` | medium | no `User=` and no `DynamicUser=yes`, or `User=root`/`0` |
| `svc-no-new-privileges` | medium | `NoNewPrivileges=` not on |
| `svc-protect-system-missing` | medium | `ProtectSystem=` unset or off |
| `svc-protect-home-missing` | medium | `ProtectHome=` unset or off |
| `svc-full-privilege-exec` | medium | `+` or `!` prefix on an `Exec*=` line (runs outside the sandbox) |
| `svc-permissive-umask` | medium | a `UMask=` that leaves new files writable by other users |
| `svc-protect-system-partial` | low | `ProtectSystem=yes` or `full` rather than `strict` |
| `svc-private-tmp-missing` | low | no `PrivateTmp=yes` |
| `svc-private-devices-missing` | low | no `PrivateDevices=yes` |
| `svc-kernel-protection-missing` | low | any of `ProtectKernelTunables=`, `ProtectKernelModules=`, `ProtectKernelLogs=`, `ProtectControlGroups=` unset (one finding listing them) |
| `svc-no-syscall-filter` | low | no `SystemCallFilter=` |
| `svc-no-address-family-restriction` | low | no `RestrictAddressFamilies=` |
| `svc-container-launcher` | low | `ExecStart=` is `docker run` (or podman, nerdctl): the container's isolation comes from the runtime's options (docker and nerdctl start it from a daemon outside the unit); the missing-sandbox checks are skipped and risks written in the unit are still reported |

**How it reads a unit.** Only the `[Service]` section counts. The unit comes
first, then its drop-ins in file-name order; the last assignment of a setting
wins, and an empty assignment (`Environment=`, `ExecStartPre=`,
`ReadWritePaths=`, `CapabilityBoundingSet=`, `AmbientCapabilities=`) resets that
list, as in systemd. Lines ending in `\` are joined. `DynamicUser=yes` is
honoured for what systemd.exec(5) says it implies (`NoNewPrivileges=`,
`ProtectSystem=strict`, `ProtectHome=read-only`, a private `/tmp`), so those are
not reported missing beside it. A drop-in with no unit beside it is checked only
for what it sets. "Missing" findings point at the unit's `[Service]` line.

**What it is not:** a security audit, or `systemd-analyze security` (which scores
a unit loaded on a running machine with its own weights; this tool does not
reproduce that score). It never runs `systemctl`, does not read
`EnvironmentFile=` contents, vendor units or drop-ins in other directories
(`/usr/lib/systemd/system`, `/run`), templates' instance values, or the program
itself, and it cannot know which privileges a service truly needs. The starter
drop-in can break a service: install it, restart, and loosen what fails. A clean
scan means only that these patterns were not found, never that a service is
safe.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste a unit
and any drop-ins (name a block `app.service.d/override.conf` to merge it into
`app.service`) and get every finding and the starter drop-in. Nothing is
uploaded, and the page makes no network calls.

## Quickstart (CLI)

```sh
python3 check.py                          # scan .service files under the current directory
python3 check.py /etc/systemd/system/     # a whole directory, drop-ins merged
python3 check.py app.service --drop-in    # also print a starter hardening drop-in
python3 check.py --format json            # machine-readable (with --drop-in: {findings, drop_ins})
python3 check.py --fail-on-risk           # exit 2 on any medium or high finding
python3 check.py --user-units ~/.config/systemd/user/   # user units: skip the root check
```

Zero dependencies, stdlib only, one file, no network calls. In a directory walk
it reads `*.service` and `NAME.service.d/*.conf` and skips `.git`,
`node_modules`, `vendor`, `dist`, `build` and virtualenvs. Low findings never
trigger `--fail-on-risk`.

## Disclaimers

Free, best-effort, no warranty. Review each finding yourself, test every
hardening change before relying on it, and have a qualified person look at
anything that protects valuable data. Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never changes what
the tool does. MIT licensed ([`LICENSE`](LICENSE)).

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only, never transmitted. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns it off. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs usage.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` over
[`fixtures/`](fixtures/) (CRLF line endings, quoting, a lone drop-in, a template
unit) and asserts the browser port produces identical findings and drop-ins.
The guide's worked example is checked against the CLI's real output in
`page.test.mjs`.

## Status

Prototype, added 2026-11-11 by an explore run. Facts about systemd's behaviour
(the D-Bus exposure of `Environment=`, what `DynamicUser=` implies, what
`ProtectSystem=` modes cover) were checked against the current systemd.exec(5)
manual that day. Next, if people use it: `.socket` files (`ListenStream=` on all
interfaces), `.timer` units, and a devsec-toolkit entry.
