# sudoers Check

A free tool that reads your own `/etc/sudoers` and the files in
`/etc/sudoers.d`, in the order `sudo` reads them, and lists the rules that
hand out more than they look like they do: a `NOPASSWD: ALL`, an editor or
pager that opens a root shell, `ALL, !/usr/bin/su`, a script in a home
directory, a wildcard that also matches `../` and extra options, `SETENV`,
`env_keep += LD_PRELOAD`. It also finds the rules that do less than they say:
a `NOPASSWD` line that a later `%sudo` rule overrides, and a drop-in named
`deploy.conf` that `sudo` never reads. Each finding prints `file:line`, the
risk and the fix, and the report ends with who can become root and how.

**Live tool:** https://marisstella.app/sudoers-check/
· **Guide:** [`sudoers-mistakes-explained.html`](sudoers-mistakes-explained.html)

**Who it is for:** anyone who runs a Linux server, VPS or cloud image and has
added a sudo rule for a deploy user, a support team or a backup job, and teams
that keep sudoers drop-ins in Ansible, Puppet, Chef or cloud-init and want a
check before they ship.

| Type | Severity | What it flags |
| --- | --- | --- |
| `nopasswd-all` | high | `NOPASSWD: ALL` as root (also through `Defaults !authenticate`) |
| `all-users-full-root` | high (low with `targetpw`/`rootpw`/`runaspw`) | `ALL` users may run `ALL` |
| `negated-command-bypass` | high | `ALL` minus commands (`ALL, !/usr/bin/su`), also through an alias |
| `shell-escape-command` | high (pagers and clients medium with `NOEXEC`) | editors (`vim`, `nano`, `emacs`, `ed`), pagers (`less`, `man`, `journalctl`) and interactive clients (`psql`, `mysql`, `sqlite3`, `ftp`, `gdb`, `screen`), whatever the arguments |
| `runs-any-command` | high | shells, `env`/`nice`/`xargs`-style launchers, interpreters, and `find`, `tar`, `systemctl`, `docker`, `git`, `rsync`, `apt-get`, `pip` and similar, with no arguments or wildcard arguments |
| `writes-any-file` | high | `tee`, `cp`, `mv`, `dd`, `chown`, `chmod`, `ln`, `curl`, `wget` and similar, and account tools (`passwd`, `usermod`, `gpasswd`), with open arguments |
| `writable-command-path` | high (low when a `sha256:`-style digest pins it) | a program, or a script given to a shell or interpreter, under `/home`, `/tmp`, `/var/tmp`, `/dev/shm`, `/run/user`, `/var/www` or `/srv` |
| `directory-or-glob-command` | high | a command that is a directory (`/usr/bin/`) or a pattern (`/usr/sbin/*`) |
| `setenv-tag` | high | `SETENV:` on a command |
| `env-reset-off` | high | `Defaults !env_reset` |
| `env-keep-dangerous` | high (`PATH` medium, `EDITOR`/`PAGER`/`HOME` low) | `env_keep` or `env_check` of `LD_PRELOAD`, `LD_LIBRARY_PATH`, `PYTHONPATH`, `PERL5OPT`, `NODE_OPTIONS`, `BASH_ENV` and others (`PATH` only without `secure_path`) |
| `authenticate-off` | high | `Defaults !authenticate`, global, per user or per runas user (medium when bound to commands, `Defaults!cmnd`, whose own risk is then reported rule by rule) |
| `defaults-setenv` | high | `Defaults setenv` |
| `reads-any-file` | medium | `cat`, `head`, `grep` and similar with open arguments |
| `wildcard-arguments` | medium | any other command with `*`, `?` or `[` in its arguments, or a regex argument with `.*` |
| `credential-cache-unbounded` | medium (low over 60 min) | negative or long `timestamp_timeout` |
| `credential-cache-shared` | low | `!tty_tickets` or `timestamp_type=global` |
| `use-pty-off` | low | `Defaults !use_pty` |
| `visiblepw-on` | low | `Defaults visiblepw` |
| `pwfeedback-on` | low | `Defaults pwfeedback` |
| `secure-path-missing` | low | no `secure_path` (only when the main `sudoers` file is given) |
| `nopasswd-overridden` | low | a `NOPASSWD` rule that a later `ALL` rule for the same user, `ALL`, or a group the user may be in overrides (sudo uses the last match) |
| `includedir-file-ignored` | low | a file in an `@includedir` directory whose name contains `.` or ends in `~`, which sudo skips |

A rule whose target user is not root (`(postgres)`, `(www-data)`) drops one
level; a group-only runas such as `(:adm)` runs as the user and is not
reported.

**How it reads sudoers.** Behaviour follows the
[sudoers(5) manual for sudo 1.9.15](https://www.sudo.ws/docs/man/1.9.15/sudoers.man/).
A block named `sudoers` is read first; `@include`/`#include` pull in a named
file and `@includedir`/`#includedir` every file in a directory, in lexical
order, skipping names with a `.` or a trailing `~`. Comments start at `#`
unless it is quoted or followed by a digit (`#0` is a user ID). Lines ending
in `\` are joined. `User_Alias`, `Runas_Alias`, `Host_Alias` and `Cmnd_Alias`
(also `Cmd_Alias`) are expanded, nested and negated. Runas specs and tags carry
to the following commands until changed, as the manual says, and a tag is
cleared by its opposite. `: Host =` groups, escaped `\,` `\:` `\=` in
arguments, `sha256:` digests, `CWD=`/`TIMEOUT=`-style option specs and
`^...$` regular-expression arguments are read. With no `sudoers` file, a file
in a `sudoers.d` directory is read as if the standard `@includedir` had pulled
it in. In a checked-out copy (a config-management repository, a CI workspace)
an absolute `/etc/...` include is also looked for under the main file's own
directory, so `repo/sudoers` with `@includedir /etc/sudoers.d` reads
`repo/sudoers.d` and still reports a dotted drop-in sudo would skip.

**Whether a rule needs a password.** A `NOPASSWD:`/`PASSWD:` tag decides first.
Otherwise `authenticate` Defaults are applied the way sudo 1.9.15p5 applied
them when tested with the same file bind-mounted over `/etc/sudoers`: global,
host, user (`Defaults:`) and runas (`Defaults>`) entries in file order, the
last matching one winning, then command entries (`Defaults!`). A binding list
is read last-match, like a runas list (`Defaults>!root,ALL` binds root). A
`Defaults!/usr/bin/vim !authenticate` under an `ALL` rule is reported as that
command running as root without a password. Rules for root alone are not
reported, since sudo never asks root for a password.

**How the parser was checked.** `sudo` ships `cvtsudoers`, which prints a
sudoers file as JSON using `sudo`'s own parser. [`parity-cases.mjs`](parity-cases.mjs)
holds 42 grammar corner cases; [`parity-gen.mjs`](parity-gen.mjs) ran each
through `visudo -c` and `cvtsudoers -e -f json` from sudo 1.9.15p5 (Ubuntu
24.04) and recorded the result in
[`parity-expected.json`](parity-expected.json). The checker's reading matches
on all 41 cases that `cvtsudoers` could print;
[`parity.test.mjs`](parity.test.mjs) runs the comparison, and re-runs
`cvtsudoers` live wherever it is installed. The same comparison runs on a whole
real file: the EXAMPLES section of the sudoers(5) manual
([`fixtures/sudo-manual-example/sudoers`](fixtures/sudo-manual-example/sudoers),
ISC licence notice kept), 49 rule entries over aliases, digests, host groups
and netgroups, all matching. The one case left out is an option
spec (`CWD=/srv`) for which that `cvtsudoers` printed JSON that does not
parse. Two differences are representation only and are normalised in the
test: `cvtsudoers` prints runas groups with a `%`, and prints the `SETENV`
that `ALL` implies on every command it groups with `ALL`. The first run of
this comparison found a real bug (the `LOG_INPUT`/`MAIL` tags were not cleared
by their opposites), and the manual's example found a second (a `sha224:`
digest inside a `Cmnd_Alias` was read as the start of a new alias); both
were fixed before release.

**What it is not:** a security audit, or `visudo -c` (which checks syntax and
should be run as well). It never runs `sudo`, does not know group
memberships, who can write to the programs a rule names, your `sudo` version,
or rules held in LDAP or SSSD, and it cannot tell why a rule exists. Its list
of programs with shell escapes is our own and not complete;
[GTFOBins](https://gtfobins.github.io/) documents the exact escapes in detail
(not affiliated). A clean scan means only that these patterns were not found,
never that a system is safe.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste
`sudoers` and any `sudoers.d/...` files and get every finding and the
who-can-become-root list. Nothing is uploaded, and the page makes no network
calls.

## Quickstart (CLI)

```sh
sudo node check.mjs /etc/               # /etc/sudoers and /etc/sudoers.d/*
node check.mjs ./sudoers.d/90-app       # one drop-in from a repository
node check.mjs /etc --format json       # machine-readable: {files, findings, rootPaths, notes}
node check.mjs . --fail-on-risk         # exit 2 on any high or medium finding
```

Node 18 or later, zero dependencies, no network calls. `/etc/sudoers` is mode
0440, so reading the live files needs root; a copy works as well. For a
directory it reads `DIR/sudoers` and every file in `DIR/sudoers.d`, or the
files in `DIR` itself when `DIR` is a `sudoers.d` directory.

Exit codes: 0 done, 1 bad input, 2 `--fail-on-risk` and a high or medium
finding.

## Tests

```sh
node --test scan.test.mjs parity.test.mjs page.test.mjs usage.test.mjs
node parity-gen.mjs     # regenerate parity-expected.json (needs visudo and cvtsudoers)
```

`fixtures/ubuntu/` is the stock `/etc/sudoers` and `/etc/sudoers.d/README` of
Ubuntu 24.04 with sudo 1.9.15p5, and has no findings. `fixtures/risky/` has
one of most rule-level mistakes. `fixtures/sudo-manual-example/` is the
sudoers(5) EXAMPLES section; `scan.test.mjs` pins what is reported on it. Where the original sudo's `visudo` is installed, the tests also
check that it accepts the fixtures. Another `visudo` on a GitHub Actions
runner, whose messages differ from sudo 1.9.15's, rejected the risky fixture's
wildcard arguments, negative `timestamp_timeout` and `!authenticate` outright,
so what this tool reads is sudo 1.9.x syntax; another implementation may refuse
some of these rules rather than run them.

## Known gaps

The quality census of 2026-11-15 ([audit](../../portfolio/quality/audits/2026-11-15-sudoers-check.json))
found five defects; the re-audit of 2026-11-21
([audit](../../portfolio/quality/audits/2026-11-21-sudoers-check.json)) checked
each against real sudo and closed all five. Still open:

- `nopasswd-overridden` only considers a later `ALL` rule; a later rule for
  the same specific command, or a later `Defaults` that turns `authenticate`
  back on, is not reported as overriding `NOPASSWD`.
- A `Defaults!cmnd` binding is matched by command path; a binding with a
  directory, glob or regular expression is not expanded.

## Licence

FSL-1.1-MIT. See [`LICENSE`](LICENSE).
