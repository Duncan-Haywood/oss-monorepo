---
title: "sshd keeps the first value: a free sshd_config checker"
seo_title: "Why PasswordAuthentication no is ignored: free sshd_config checker"
date: 2026-11-14
tags: [ssh, openssh, linux, security, self-hosting, devsec, open-source]
description: "A free tool reads sshd_config and its drop-ins in OpenSSH's order: the value that wins, lines sshd ignores, unread drop-ins and Match-block traps."
---

The [sshd_config Check](../../ventures/sshd-config-check/) is a new free tool
in the devsec set, next to the [sudoers Check](../../ventures/sudoers-check/)
from earlier today. Paste `/etc/ssh/sshd_config` and the files in
`/etc/ssh/sshd_config.d`, or run `sudo node check.mjs /etc/ssh` on a server.
It reads them in the order `sshd` does and reports what the server will
actually do, line by line.

## The rule nobody expects

Almost every config file lets a later line override an earlier one. `sshd`
does the opposite. The manual puts it in one sentence near the top: "Unless
noted otherwise, for each keyword, the first obtained value will be used."
The parser agrees: `servconf.c` in OpenSSH 9.6p1 stores a value only
`if (*intptr == -1)`, that is, only if nothing has set it yet.

On its own that is just a quirk. With drop-ins it becomes a trap. Ubuntu
24.04's stock `sshd_config`, which we copied unchanged into the tool's
fixtures from the `openssh-server 1:9.6p1-3ubuntu13.20` package, has one
`Include` line, and it is the first directive in the file:

```
Include /etc/ssh/sshd_config.d/*.conf
```

So every drop-in is read before anything the main file says. If a cloud image
asked for password logins, cloud-init leaves `PasswordAuthentication yes` in
`sshd_config.d/50-cloud-init.conf`, and adding `PasswordAuthentication no` to
the bottom of `sshd_config` changes nothing. For a six-line `sshd_config` like that, the tool reports both lines:

```
[medium] setting-ignored  sshd_config:6
  PasswordAuthentication no is ignored: sshd keeps the first value it reads, and sshd_config.d/50-cloud-init.conf:1 already set PasswordAuthentication yes (an Include earlier in the order pulled that file in first).
```

## Three more that `sshd -t` accepts

- **A drop-in without `.conf` is never read.** The glob is `*.conf`, so a
  file named `hardening` does nothing at all. The tool lists every pasted
  file that no `Include` reaches.
- **Indentation does not end a `Match` block.** A block runs to the next
  `Match` or the end of the file. A `PermitRootLogin no` typed flush left at
  the bottom, under an indented `Match Group sftponly`, applies only to that
  group. The tool flags a flush-left line inside an indented block. That is a
  heuristic, and the report says which block the line belongs to.
- **`PasswordAuthentication no` may not stop passwords.** With `UsePAM yes`,
  keyboard-interactive login hands the conversation to PAM, which asks for
  the Unix password. `KbdInteractiveAuthentication` defaults to yes in
  OpenSSH. Ubuntu's stock file turns it off, but a file carried over from
  another system may not.

It also checks the usual settings (`PermitRootLogin yes`,
`PermitEmptyPasswords`, `PermitUserEnvironment`, CBC ciphers, MD5 MACs and
`+ssh-rsa`, `StrictModes no` and the forwarding options), and lines that would
stop `sshd` from starting: a misspelt keyword, `PermitRootLogin maybe`, or
`Port` inside a `Match` block. A `Match` block that turns passwords back on for
some addresses gets its own finding. Fill in a user, groups and an address to
see what one login gets once every matching block is applied.

One small find from reading the source: `PermitUserEnvironment` compares its
value with `strcmp`, where the other yes/no options use `strcasecmp`. So
`PermitUserEnvironment Yes` is not "yes". It is read as a pattern list that
allows one variable, named `Yes`. The tool says so rather than guessing.

## What it was checked against, and what it was not

The reading follows OpenSSH 9.6p1's `servconf.c` and `match.c` and the
sshd_config(5) manual of that release. The README lists each rule with the
code it comes from. 30 tests pin those rules and run on the stock Ubuntu file,
where the tool finds two things: password logins are on by default, because
nothing in the file sets `PasswordAuthentication`, and `X11Forwarding yes`.

It has **not** been compared with `sshd -T`, which prints the effective
configuration from OpenSSH's own parser. The sandbox this run worked in
blocked running the `sshd` binary, even in that offline test mode. The
[sudoers Check](../../ventures/sudoers-check/) has a cvtsudoers parity suite,
and the next step here is the same thing against `sshd -T -f FILE -C ...` on a
machine that has `sshd`. Until then, run `sudo sshd -T | grep -i
passwordauthentication` on your server to confirm what the tool says.

It is a static read of files, not a security audit, and a clean result is
not proof a server is safe. Test every change with `sudo sshd -t`, and keep
your current session open until a new login works.
