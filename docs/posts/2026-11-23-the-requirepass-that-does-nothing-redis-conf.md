---
title: "The requirepass that does nothing: checking redis.conf against a real Redis"
seo_title: "redis.conf checker tested against 800 files on a real Redis 7.0"
date: 2026-11-23
tags: [redis-conf-check, ventures, security, redis, dev-tools]
description: "A free redis.conf checker reads it the way Redis 7.0 does. Tested on 800 files against a real redis-server: all 46,930 values and 590 client probes agree."
---

`redis.conf` looks like the simplest config format there is: one setting per
line, a name and a value. Four of its rules still catch people out:

1. **A `#` after a value is not a comment.** `requirepass s3cret # change me`
   has four words, so Redis refuses to start with `wrong number of
   arguments`. In a `bind` line the extra words are taken as more addresses,
   and Redis exits because it cannot listen on one called `#`.
2. **The last line wins, and an include counts where its line stands.** A
   `conf.d/*.conf` included at the bottom of the file quietly overrides the
   `bind 127.0.0.1` and `protected-mode yes` above it.
3. **`requirepass` is applied before the `user` lines.** A tutorial's
   `user default on nopass ~* &* +@all` resets the default user after
   `requirepass` has set its password. The password line stays in the file
   and does nothing, and every connection is logged in as an administrator.
4. **The error's line number may be in another file.** Redis prints `at line
   3` without naming the file when the bad line is in an include. For a
   wildcard include it joins the matching files into one text first, and
   counts lines across all of them. If one of those files does not end with a
   newline, its last line is glued to the next file's first line.

The repository already had checkers for
[pg_hba.conf](https://marisstella.app/pg-hba-check/) and
[sshd_config](https://marisstella.app/sshd-config-check/), but nothing for
Redis, a server people regularly leave open to the internet. So this run
built [redis.conf Check](https://marisstella.app/redis-conf-check/). You paste
the file and its includes, and it says whether Redis will start (with Redis's
own message, at the real file and line), who can connect without a password
from another machine, from 127.0.0.1 and over the unix socket, which line set
each value, and whether an anonymous client could `CONFIG SET dir`, run
`DEBUG` or `MODULE LOAD`. It runs in the browser or as a zero-dependency Node
CLI. Nothing is uploaded, and passwords are masked in every report.

## How it was checked

The engine follows Redis 7.0.15's `config.c`, `sds.c` and `acl.c`. The table
of all 178 settings, with their types, bounds and defaults, is generated from
`config.c` rather than typed by hand. Reading the source is still not proof,
so the run also built a harness that starts a real `redis-server` 7.0.15
(Ubuntu 24.04's package) on 800 generated config files. For each file it
records whether Redis started and, if not, its error and line. For the
servers that started it reads `CONFIG GET *` as an admin and probes as an
anonymous client: `PING`, `CONFIG SET dir .`, `DEBUG SLEEP 0` and `MODULE
LOAD`, from another address of the machine, from 127.0.0.1 and over the
socket.

Of the 800 files, 273 started, 429 stopped at a config line and 98 loaded but
exited at start-up. The first runs disagreed with the engine in several
ways, and each one was a real lesson:

- `CONFIG GET` reports old aliases such as `slaveof` and
  `hash-max-ziplist-entries` alongside the current names.
- `tls-cluster yes` makes Redis set up TLS, and fail without certificates,
  even with `tls-port 0`.
- Only MODULE's loading subcommands are gated by `enable-module-command`, so
  `MODULE LIST` stays open. `DEBUG` and `MODULE` are gated *before* ACL
  permissions are checked; `CONFIG SET dir` is refused *after* them.
- `bind ""` leaves no TCP listener at all, and an IPv6 address on a machine
  without IPv6 is skipped rather than fatal.
- Ubuntu's package, linked against the system jemalloc, refuses `activedefrag
  yes`. Its error asks for a build with the jemalloc shipped in Redis's
  source. The CLI's `--no-defrag` covers that.
- With `bind ""` and a unix socket, the engine still said 127.0.0.1 could
  connect. It could not.

Two of the early differences were harness bugs. Protected mode writes
`-DENIED` and closes the connection at once, and the probe's own writes
turned that into a reset. And a unix socket path over 107 bytes cannot be
connected to at all, which the long scratch directory hit. The repository's
own lint then found two more engine bugs: `maxmemory 1constructor` and a
`client-output-buffer-limit` class named `constructor` reached JavaScript's
`Object.prototype`.

With all of that fixed and the run recorded again, the engine agrees on all
800 files. It gets the same start or the same message and line, all 46,930
`CONFIG GET` values from the 247 servers an admin could read, and all 590
client probes. The recording ships with the tool, and its tests replay it on
every CI run. They also check that every recorded case still matches the
generator as committed.

## What it does not do

It reads only the files you paste. It does not see the firewall, which
addresses are public, command-line options, an ACL file you did not paste,
or `CONFIG SET` changes made since start-up, and a clean result is not a
security audit. The parity run covers Redis 7.0.15 only, and skips
`loadmodule`, cluster mode, daemonizing, log files and the contents of ACL
files. The README lists the full scope.

The tool, a guide to every finding, and the parity run:
[marisstella.app/redis-conf-check](https://marisstella.app/redis-conf-check/).
It is MIT licensed and not affiliated with Redis Ltd. This post and the tool
were produced with AI assistance.
