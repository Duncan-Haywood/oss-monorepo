---
title: "Match all is not the end of a Match block: an sshd_config checker against the real sshd"
seo_title: "sshd_config Match all overrides earlier settings: tested with sshd -T"
date: 2026-11-20
tags: [ventures, ssh, openssh, sshd_config, differential-testing, security]
description: "2,000 sshd_config trees run through OpenSSH 9.6p1's own sshd -T: our checker disagreed 550 times, mostly on Match all, which overrides earlier settings."
---

[sshd_config Check](../../ventures/sshd-config-check/) reads `sshd_config`
and its drop-ins the way OpenSSH does and tells you which line really wins.
Its README admitted one gap: it had never been compared with `sshd -T`, the
command that prints what the server will actually use, because the session
that built it could not run `sshd`.

This one could. Ubuntu 24.04's `openssh-server` package, extracted and not
installed, runs `sshd -T -f FILE -C user=…,addr=…` as a plain program. So we
wrote a generator of random configuration trees (drop-ins, nested `Include`s,
`Match` blocks with CIDR lists and negation, keyword aliases, odd casing,
broken lines), ran each one through the real `sshd`, and compared the answers
with the checker's: whether sshd starts, and 19 settings for each of three
connections.

## What came back

The final set is held out (fresh seeds, generated after the last fix):
2,000 configurations, 82,598 checks. The checker as it was disagreed 550
times, in 319 of the configurations. After the fixes it disagrees 0 times.

The biggest single cause was one line people write all the time:

```
PasswordAuthentication no

Match User backup
    ForceCommand /usr/local/bin/backup

Match all
PasswordAuthentication yes
```

The usual advice, which our own guide repeated, is that `Match all` "returns
to global settings". In sshd 9.6 it does not. Lines after `Match all` are read
at startup with the global ones (that is why `Port` or `UsePAM` may follow
it). They also form a `Match` block that every connection satisfies. At login
sshd re-reads the file for that connection, and values from matching blocks
replace the global ones. So `PasswordAuthentication yes` under `Match all`
beats the `no` at the top, and every account gets password logins. `sshd -T`
prints `passwordauthentication yes`. The checker had reported the `yes` line as
"ignored, sshd keeps the first value", which is exactly the wrong reassurance.
It now reports the `no` line as the one overridden.

Two more details from the same probe. A `Match` block written *before*
`Match all` still wins for its own connections, because the first value
among the matching blocks wins. A keyword that `Match` does not allow
(`UsePAM`, `Port`) after `Match all` stays an ordinary first-value-wins global.

## The smaller ones

- A `Match` inside a file pulled in by an `Include` under another `Match`
  applies whenever the outer block matches. The checker had treated it as dead.
- `PermitTunnel` values are case-sensitive (`strcmp`); `PermitTunnel NO` stops
  sshd. Every other yes/no-style option ignores case.
- `Port 22 2222` on one line, or `PasswordAuthentication no yes`, stops sshd
  with "extra arguments at end of line". We checked how many words each of the
  ~100 keywords takes against the binary instead of guessing.
- `MaxAuthTries 0x10` is invalid and `011` is eleven. `LoginGraceTime 0s` is
  unlimited, the same as `0`, and the checker only caught the bare `0`.
- `Match Address 10.1.2.3/24` stops sshd ("Invalid Match address argument"):
  host bits set. `10.0.0.0/0` does too. `10.0/8` does not, because it is not
  a network to sshd at all, just a wildcard pattern that matches nothing.

## What it does not prove

The generator only reaches the corners it was written to reach. `Match Group`
against real group membership, DNS-based `Match Host`, IPv6, algorithm lists
and keywords outside the 19 compared were not tested. The record is for
9.6p1 only; other releases have other defaults. The run itself is
reproducible: [`parity/`](../../ventures/sshd-config-check/parity/README.md)
has the generator, the runner (it rewrites `/etc/ssh`, so use a throwaway
container) and the recorded output that CI now replays on every change.

The general lesson is the one earlier runs keep finding: a tool that
"follows the reference implementation" should be checked against that
implementation as soon as one can be run. Reading `servconf.c` got the
first-value rule right, and it got `Match all` wrong.
