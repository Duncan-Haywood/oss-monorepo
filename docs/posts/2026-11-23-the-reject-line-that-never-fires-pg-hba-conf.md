---
title: "The reject line that never fires: checking pg_hba.conf against a real PostgreSQL"
seo_title: "pg_hba.conf checker tested against 5,760 real PostgreSQL logins"
date: 2026-11-23
tags: [pg-hba-check, ventures, security, postgresql, dev-tools]
description: "A free pg_hba.conf checker reads the file the way PostgreSQL 16 does. Tested on 600 files and 5,760 real connections, it found its own samerole bug."
---

`pg_hba.conf` is the file that decides who may connect to a PostgreSQL server,
from where, and how they prove who they are. It looks like a firewall rule
list, and that is the trap. Three things about it surprise people:

1. **The first matching line decides.** Not the most specific one. Put
   `host all postgres 0.0.0.0/0 reject` under `host all all 0.0.0.0/0 md5`
   and the reject never fires: line 5 has already let `postgres` in.
2. **One bad line refuses the whole file.** A typo such as `scram` for
   `scram-sha-256`, or `10.1` without a `/8` (PostgreSQL then reads the method
   as the netmask: `invalid IP mask "md5"`), and the server will not start. On
   a reload it is worse: PostgreSQL logs the error and keeps the old rules, so
   the edit you just made silently does nothing.
3. **Keywords only count unquoted, and `all` is not everything.** `"all"` is
   a database or role literally named all, and the database `all` does not
   match physical replication connections.

The repository already had checkers for
[sshd_config](https://marisstella.app/sshd-config-check/) and
[sudoers](https://marisstella.app/sudoers-check/), and nothing for the
database's front door. So this run built
[pg_hba.conf Check](https://marisstella.app/pg-hba-check/): paste the file and
its includes, and it shows the lines that will not load, the rules that can
never match, which line decides typical connections, and the rules that let
people in more easily than they look (trust over TCP, cleartext passwords on
lines that accept non-TLS connections, ident over TCP, md5, regexes such as
`/admin` that match `notadmin`). It runs in the browser or as a Node CLI with
no dependencies, and it never connects to anything.

## Smaller traps the parser has to get right

Reading the file the way PostgreSQL does means copying some behaviour that
looks like a bug:

- PostgreSQL parses IPv4 with the C library's `inet_aton` rules. So
  `010.0.0.7/32` is **8.0.0.7** (a leading zero is octal), and `10.1` is
  10.0.0.1.
- Anything that is not a valid numeric address becomes a host name, with no
  error. `10.0.0.300` is a host name that PostgreSQL will look up for every
  connection and that almost certainly never matches.
- `app ,other` is two fields, but `app, other` is one: a blank *before* the
  comma ends the field.
- A `hostssl` line on a server with `ssl = off` shows an error in the
  `pg_hba_file_rules` view, but the file still loads; the line just never
  matches.

## Testing it against the real thing

The parser is an independent JavaScript implementation, written from
PostgreSQL 16's
[`hba.c`](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/libpq/hba.c)
and the manual, so the question is whether it agrees with PostgreSQL. A
throwaway PostgreSQL 16.15 server (Ubuntu 24.04's package) answered that in
two ways.

**Parsing.** A seeded generator wrote 600 files of odd but plausible lines:
quotes, commas, continuations, every include form, bad masks, shorthand
addresses, every method and many options, valid and invalid. Each file went
into the data directory and the `pg_hba_file_rules` view was read back. The
engine agreed with all 3,583 rows on every column, error text included. (For
a regular expression PostgreSQL cannot compile, only the failure is compared:
its regex engine words its errors its own way.)

**Matching.** 160 more files of valid rules were loaded one at a time, and 36
real connections made against each: the socket and TCP with and without TLS,
as three roles, to three databases and as physical replication. Every login
role had a SCRAM password, so `log_connections` logged the exact file and line
that authenticated each one. The first run disagreed on 33 of 5,760
connections, for two reasons:

- 20 were the harness's fault. A refused replication connection says
  `pg_hba.conf rejects replication connection`, not `rejects connection`, so
  the runner filed them as unknown errors.
- 13 were a real bug in the checker. `samerole` matches when the user is a
  member of the role named like the database, and in PostgreSQL **a role is a
  member of itself**. So `local samerole all scram-sha-256` lets `postgres`
  into the database `postgres`, and the checker said it did not. The same
  goes for `+bob` matching the user `bob`.

With both fixed and the run recorded again, the engine names the same line, or
the same refusal, for every connection. The recording ships with the tool,
and its test suite replays it on every run, so a later change that breaks
agreement fails CI without needing a server. The container had no IPv6, so
IPv6 matching rests on unit tests and the parse run, not on real
connections.

## What it does not do

It reads only the files you paste. It cannot see `listen_addresses`, the
firewall, which roles are superusers, `pg_ident.conf` maps or the network,
and a clean result is not a security audit. For anything it cannot know
(group membership you did not give, reverse DNS for a host-name rule) it says
the line is undecided instead of guessing.

The tool, a guide to every finding, and the parity run:
[marisstella.app/pg-hba-check](https://marisstella.app/pg-hba-check/). It is
MIT licensed and not affiliated with the PostgreSQL Global Development Group.
This post and the tool were produced with AI assistance.
