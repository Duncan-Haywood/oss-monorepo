# sshd_config Check

A free tool that reads your own `/etc/ssh/sshd_config` and the files its
`Include` lines pull in, in the order `sshd` reads them, and shows what the
server will really do. `sshd` keeps the **first** value it reads for a
setting and silently ignores the rest, so on Ubuntu and Debian (whose
`sshd_config` starts with `Include /etc/ssh/sshd_config.d/*.conf`) a
cloud-init drop-in that says `PasswordAuthentication yes` beats your `no`
further down. The tool reports that line and the one that won, drop-ins `sshd`
never reads (`hardening` without `.conf`), settings written flush left after a
`Match` block that still belong to it, lines that stop `sshd` starting, and
the settings that let people in more easily than meant: `PermitRootLogin yes`,
password logins (including the default and PAM's keyboard-interactive route),
`PermitEmptyPasswords`, `PermitUserEnvironment`, weak algorithms and more.
Each finding prints `file:line`, what happens and the fix, and the report ends
with how people can log in, globally and under each `Match` block.

**Live tool:** https://marisstella.app/sshd-config-check/
· **Guide:** [`sshd-config-mistakes-explained.html`](sshd-config-mistakes-explained.html)

**Who it is for:** anyone who runs a Linux server, VPS or cloud image and has
hardened SSH by editing `sshd_config` or adding a drop-in, and teams that ship
`sshd_config.d` files from Ansible, Puppet, Chef or cloud-init and want a check
before they ship.

| Type | Severity | What it flags |
| --- | --- | --- |
| `sshd-will-not-start` | error | an unknown or misspelt keyword, a value the keyword does not accept, a keyword with no value, unbalanced quotes, a bad `Match` line, `Include` nested over 16 deep |
| `global-only-in-match` | error | `Port`, `Ciphers`, `UsePAM` and the other keywords not allowed inside `Match` |
| `permit-root-login-yes` | high with passwords on, else low | `PermitRootLogin yes` |
| `permit-empty-passwords` | high with passwords on, else medium | `PermitEmptyPasswords yes` |
| `permit-user-environment` | high (`yes`, or a list admitting `LD_*`, `BASH_ENV`, `*`), low for other lists | `PermitUserEnvironment` other than `no`; `Yes` is read as a pattern list |
| `password-auth-on` | medium | `PasswordAuthentication yes`, including the default when nothing sets it |
| `kbd-interactive-pam` | medium | `KbdInteractiveAuthentication` on (the default) with `UsePAM yes`: PAM still asks for the password |
| `setting-ignored` | medium for security settings, else low | a line `sshd` ignores because an earlier line or an earlier-included file set the keyword to a different value |
| `dropin-not-read` | medium with a security setting, else low | a file in `sshd_config.d` that no `Include` matches |
| `looks-global-but-in-match` | medium for security settings, else low | a flush-left line after an indented `Match` body (a heuristic) |
| `weak-algorithm` | high (RC4), medium (CBC, MD5, group1, DSA), low (SHA-1, UMAC-64, `ssh-rsa`) | listed or `+`-added in `Ciphers`, `MACs`, `KexAlgorithms`, `HostKeyAlgorithms`, `PubkeyAcceptedAlgorithms`, `CASignatureAlgorithms` |
| `strict-modes-off` | medium | `StrictModes no` |
| `rhosts-honoured` | medium | `IgnoreRhosts no` |
| `hostbased-auth-on` | low | `HostbasedAuthentication yes` |
| `x11-forwarding-on` | low | `X11Forwarding yes` (on in Ubuntu's stock file) |
| `gateway-ports-on` | low | `GatewayPorts yes` or `clientspecified` |
| `tunnel-devices-on` | low | `PermitTunnel` other than `no` |
| `max-auth-tries-high` | low | `MaxAuthTries` over 10 |
| `login-grace-unlimited` | low | `LoginGraceTime 0` |
| `ignored-option` | low | deprecated or unsupported options that do nothing (`UsePrivilegeSeparation`, `RSAAuthentication`, ...) |

A `Match` block that turns one of these on is reported in its own scope
(`Match Address 10.20.0.0/16`), on top of the global settings.

**How it reads sshd_config.** Behaviour follows OpenSSH 9.6p1, the release
Ubuntu 24.04 ships: the parser itself
([`servconf.c`](https://github.com/openssh/openssh-portable/blob/V_9_6_P1/servconf.c),
[`match.c`](https://github.com/openssh/openssh-portable/blob/V_9_6_P1/match.c))
and the [sshd_config(5) manual](https://github.com/openssh/openssh-portable/blob/V_9_6_P1/sshd_config.5)
of that release. In detail:

- The first value read wins ("Unless noted otherwise, for each keyword, the
  first obtained value will be used", sshd_config(5)). `Port`,
  `ListenAddress`, `HostKey`, `HostCertificate`, `AcceptEnv` and
  `Allow`/`DenyUsers`/`Groups` add up instead; `Subsystem` keeps the first
  definition per name.
- Keywords are case-insensitive and may be followed by `=`. Values in the
  yes/no and multi-state options are compared case-insensitively, except
  `PermitUserEnvironment` (`strcmp` in `servconf.c`).
- Words split on whitespace; double or single quotes group; an unquoted word
  starting with `#` ends the line.
- `Include` takes one or more globs; a relative one resolves against
  `/etc/ssh`; matches are read in byte order where the `Include` line stands;
  a glob that matches nothing is not an error. An `Include` inside a `Match`
  puts the file's lines in that block, and a `Match` inside an included file
  ends at that file's end (the "Don't let included files clobber the
  containing file's Match state" comment in `servconf.c`).
- A `Match` block runs to the next `Match` or the end of the file; `Match all`
  returns to global settings. `Match` values replace global ones, and when
  several blocks apply, the first value among them wins
  (`copy_set_server_options`). `User`, `Group`, `Host`, `Address`,
  `LocalAddress`, `LocalPort` and `RDomain` are evaluated for a given
  connection with OpenSSH's pattern rules: comma lists, `*` and `?`, `!`
  negation that overrides a positive hit, case-sensitive users, lowercased
  hosts and IPv4 CIDR addresses.
- With no file named `sshd_config`, the files are read as if the stock
  Ubuntu/Debian `Include /etc/ssh/sshd_config.d/*.conf` had included them.
- Defaults are 9.6's compiled-in ones (`fill_default_server_options`), for
  example `PasswordAuthentication yes`, `KbdInteractiveAuthentication yes`,
  `PermitRootLogin prohibit-password`, `UsePAM no` (Debian and Ubuntu set it
  to yes in their stock file).

**How it was checked, and what was not.** The 30 cases in
[`scan.test.mjs`](scan.test.mjs) pin each rule above against the line of
`servconf.c` or `match.c` it comes from, and run on the unmodified stock
`sshd_config` from Ubuntu 24.04's `openssh-server 1:9.6p1-3ubuntu13.20`
([`fixtures/`](fixtures/README.md)). It was **not** compared with `sshd -T`'s
own output: the session that built it could not run `sshd`. A parity run
against `sshd -T -f FILE -C user=...` on real configs is the next step.

## Use it

In the browser: open the live tool, paste `sshd_config` and each drop-in
(named like `sshd_config.d/50-cloud-init.conf`), optionally fill in a user,
groups and address to see what one login gets, and press Check.

From the command line (Node 18+, no dependencies, never runs `sshd`, no
network calls):

```
sudo node check.mjs /etc/ssh                    # sshd_config and everything it Includes
node check.mjs ./ssh                           # a copy in a repo, read as /etc/ssh
node check.mjs --root /mnt/image               # an image's /etc/ssh
node check.mjs /etc/ssh --user deploy --group sftp --addr 10.20.1.5
node check.mjs /etc/ssh --format json
node check.mjs ./ssh --fail-on-risk            # exit 2 on an error, high or medium finding
```

Tests: `node --test scan.test.mjs page.test.mjs usage.test.mjs`.

## Not a security audit

A static read of the files given. It does not know the server's OpenSSH
version and its patched defaults, `authorized_keys`, the PAM stack, firewall
rules or which accounts have passwords, and a clean result is not proof the
server is safe. Confirm with `sudo sshd -T` on the server, test changes with
`sudo sshd -t`, and keep a session open until a new login works. No warranty.
Not affiliated with or endorsed by the OpenSSH project.

Usage counting: anonymous `check_run` and `example_loaded` counts in the
browser's local storage only, with an off switch on the page; Do Not Track and
Global Privacy Control are honoured.

MIT licensed ([`LICENSE`](LICENSE)). The fixture `sshd_config` is OpenSSH's and
Debian's, under the terms in [`fixtures/OPENSSH-COPYRIGHT`](fixtures/OPENSSH-COPYRIGHT).
