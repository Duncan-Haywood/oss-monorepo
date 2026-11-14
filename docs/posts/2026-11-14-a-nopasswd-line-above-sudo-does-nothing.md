---
title: "A NOPASSWD line above %sudo does nothing: a free sudoers checker"
seo_title: "Free sudoers checker: NOPASSWD, shell escapes, ALL minus su"
date: 2026-11-14
tags: [sudo, linux, security, self-hosting, devsec, open-source]
description: "A free tool reads /etc/sudoers and sudoers.d for root shells hidden in vim, less and find rules, ALL minus su, and NOPASSWD lines that never apply."
---

The [sudoers Check](../../ventures/sudoers-check/) is a new free tool in the
devsec set. Paste `/etc/sudoers` and the files in `/etc/sudoers.d`, or run
`sudo node check.mjs /etc/` on a server, and it lists the rules that
`visudo -c` accepts but that hand out more, or less, than they look like
they do. Each finding has its file, line and fix, and the report ends with a
list of who can become root and through which rule.

## Why this one

The portfolio already reads [systemd units](../../ventures/systemd-unit-hardening-check/),
[nginx configs](../../ventures/nginx-config-security-check/) and Compose files
for risky settings. Nothing read the file that decides who is root. sudoers
mistakes come in two kinds, and both are invisible from the file alone.

**Rules that are root in disguise.** `deploy ALL=(root) NOPASSWD: /usr/bin/vim /etc/nginx/nginx.conf`
looks like "deploy may edit one file". In vim, `:!sh` is a root shell and
`:e /etc/sudoers` opens anything. The same goes for `less` and `journalctl`
(`!sh`), `find` (`-exec`), `systemctl` with open arguments (`edit`), and
`docker`. The sudoers manual is plain about one more:
`carol ALL=(ALL) ALL, !/usr/bin/su` "doesn't really prevent" anything,
because carol can copy `su` to another name.

**Rules that never apply.** sudo uses the last matching rule, "which is not
necessarily the most specific match". So this, written in the order people
usually write it, still asks alice for a password if she is in `%sudo`:

```
alice   ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
%sudo   ALL=(ALL:ALL) ALL
```

And `@includedir /etc/sudoers.d` skips every file whose name contains a dot,
so a drop-in named `deploy.conf` is never read at all.

## Checking the parser against sudo's own

A checker that misreads the grammar is worse than none, and sudoers grammar
has corners: tags and runas specs that carry to later commands until changed,
`: Host =` groups, `\,` escapes, `sha224:` digests, nested and negated aliases.
Two tools that ship with sudo made it possible to check this properly instead
of by eye. `visudo -c -f` says whether sudo accepts a file. `cvtsudoers -e -f json`
prints a file as JSON using sudo's own parser, aliases expanded.

So the test suite holds 42 grammar cases, each run through both tools from
sudo 1.9.15p5 (Ubuntu 24.04), and compares the checker's reading rule by rule.
On the first run four cases did not match. Three were representation
(cvtsudoers writes runas groups with a `%`, and prints the `SETENV` that `ALL`
implies on neighbouring commands). One was a real bug: `LOG_INPUT` and `MAIL`
tags were not cleared by `NOLOG_INPUT` and `NOMAIL`.

Then I ran the same comparison on a whole real file: the EXAMPLES section of
the sudoers(5) manual, taken from sudo's source. Of its 49 rule entries, two
did not match. One was representation again (a runas group that comes from an
alias is printed without its `%`). The other was the second real bug. The manual's `DUMPS` alias
pins a script with a digest:

```
Cmnd_Alias DUMPS = /usr/bin/mt, ..., \
           sha224:0GomF8mNN3wlDt1HD9XldjJ3SNgpFdbjO1+NsQ== \
           /home/operator/bin/start_backups
```

My alias parser split definitions on every top-level colon, so `sha224:`
ended the alias. Now only a colon followed by `NAME =` starts a new one, and
the file is a fixture. One case is left out of the comparison: for a rule with
`CWD=/srv`, this version of cvtsudoers printed JSON that does not parse
(`"runcwd": "/srv"` as a bare key in an array), so there is nothing to compare
against.

## What it says about the manual's examples

The manual introduces its examples as "a bit contrived", and several exist to
show a caveat, so this is not a criticism of them. It is a useful check that
the findings land where the manual's own commentary does:

- `pete HPPA = /usr/bin/passwd [A-Za-z]*, !/usr/bin/passwd *root*`: the manual
  warns that `*` matches several words, so `passwd username --expire` is
  allowed too. The checker reports it as high, because passwd run as root can
  reset another account's password.
- `jill SERVERS = /usr/bin/, !SU, !SHELLS`: a whole directory minus some
  programs. High, for the reason the manual gives about `!`.
- `operator`'s digest-pinned script under `/home` comes out low, not high: the
  digest means an edited script is refused rather than run, which is why the
  manual added it.
- `joe ALL = /usr/bin/su operator`, `matt valkyrie = KILL`, the CD-ROM mount
  rule and the `(: ADMINGRP)` group-only rule produce nothing.

The stock Ubuntu 24.04 `/etc/sudoers` produces no findings, and three
root paths: `root`, `%admin` and `%sudo`, all with a password.

## What it is not

It reads files. It does not know who is in `%sudo`, who can write to the
programs a rule names, your sudo version, or rules held in LDAP. Its list of
programs with shell escapes is my own and not complete;
[GTFOBins](https://gtfobins.github.io/) documents the escapes in detail. A
clean result means these patterns were not found, not that a system is
secure. Not affiliated with the sudo project or GTFOBins.

## Next

The obvious next step is group awareness: given `/etc/group`, the
"if alice is in %sudo" findings could become definite, and the root list
could name people rather than groups. A second is `Defaults!command`
bindings, which the checker reads but does not yet apply per command.
