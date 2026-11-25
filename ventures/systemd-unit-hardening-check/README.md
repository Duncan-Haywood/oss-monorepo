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
| `svc-runs-as-root` | medium | no `User=` and no `DynamicUser=yes`, or `User=root`/`0` (even with `DynamicUser=yes`: a static user of that name wins) |
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
list, as in systemd. Lines ending in `\` are joined. Paths are read the way systemd reads them: a quoted
executable is unquoted, and repeated slashes and `.` components are dropped, so
`ExecStart=//tmp/x` counts as `/tmp/x` and `ReadWritePaths=/./` as `/`. `DynamicUser=yes` is
honoured for what systemd.exec(5) says it implies (`NoNewPrivileges=`,
`ProtectSystem=strict`, `ProtectHome=read-only`, a private `/tmp`), so those are
not reported missing beside it. A drop-in with no unit beside it is checked only
for what it sets. "Missing" findings point at the unit's `[Service]` line.

Values are parsed the way systemd 255 parses them. A boolean is any of `1`, `yes`,
`y`, `true`, `t`, `on` (or the `0`/`no`/`n`/`false`/`f`/`off` set), in any case.
`ProtectSystem=` and `ProtectHome=` also take their own words, which are
case-sensitive: systemd rejects `ProtectSystem=Strict` and `ProtectHome=Read-Only`.
An assignment systemd cannot parse (including an empty one, and a trailing
`# comment`, which is part of the value) is ignored with a warning and the earlier
value stands; the finding then points at the ignored line and says so. A
`DynamicUser=` value that is not a boolean is a fatal error: the unit does not load,
and in a drop-in systemd stops reading that file at that line. `[ Service ]` (spaces
inside the brackets) is a different section. In `SystemCallFilter=` and
`RestrictAddressFamilies=` a lone `~` is an empty deny list, which filters nothing,
and `RestrictAddressFamilies=none` allows no families.

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
the tool does. FSL-1.1-MIT licensed ([`LICENSE`](LICENSE)).

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only, never transmitted. Do Not Track and
Global Privacy Control are honoured, and a button on the page turns it off. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs usage.test.mjs parity-fuzz.test.mjs systemd-analyze.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` over
[`fixtures/`](fixtures/) (CRLF line endings, quoting, a lone drop-in, a template
unit) and asserts the browser port produces identical findings and drop-ins.
`parity-fuzz.test.mjs` does the same for 4,000 random units built from risky
keys and odd spellings, with a fixed seed.
The guide's worked example is checked against the CLI's real output in
`page.test.mjs`.

**Against systemd itself.** [`eval/systemd-analyze-diff.mjs`](eval/systemd-analyze-diff.mjs)
builds seeded random unit trees (a unit plus up to three drop-ins, odd boolean
spellings, invalid and empty values, wrong-case keys and sections, CRLF,
continuations) and runs each through `systemd-analyze security --offline=yes
--json=short`, which loads the files with systemd's real parser. Ten finding types
map onto its tests (root user, `NoNewPrivileges=`, `ProtectSystem=` missing and
partial, `ProtectHome=`, `PrivateTmp=`, `PrivateDevices=`, kernel protection,
`SystemCallFilter=`, `RestrictAddressFamilies=`). Run here on 2026-11-22 with
systemd 255.4 (Ubuntu): before the fixes above, 1,455 of 3,797 loadable trees
(seed 101) disagreed on at least one finding; after them, on held-out seeds
101 to 105, 63 of 19,082 trees disagree, every one only in a
`SystemCallFilter=` or `RestrictAddressFamilies=` deny list made of names systemd
does not know (it drops unknown names; this tool does not check them). Trees
systemd refuses to load (a fatal parse error) are skipped. `systemd-analyze.test.mjs`
runs 400 trees on a fixed seed and skips when systemd-analyze 250+ is absent.

```sh
node eval/systemd-analyze-diff.mjs --seed 101 --count 4000
```

## Status

Prototype, added 2026-11-11 by an explore run. Facts about systemd's behaviour
(the D-Bus exposure of `Environment=`, what `DynamicUser=` implies, what
`ProtectSystem=` modes cover) were checked against the current systemd.exec(5)
manual that day. Next, if people use it: `.socket` files (`ListenStream=` on all
interfaces), `.timer` units, and a devsec-toolkit entry.
