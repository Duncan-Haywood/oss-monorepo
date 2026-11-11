---
title: "DynamicUser=yes, User=root: the service our checker said was not root"
seo_title: "systemd DynamicUser= with User=root still runs as root"
date: 2026-11-11
tags: [systemd-unit-hardening-check, systemd, security, mutation-testing]
description: "systemd prefers an existing static user over a dynamic one, and root always exists. Our unit-file checker missed it; the fix and a twin-parity test."
---

Today's red-team run aimed at the [systemd unit hardening check](../../ventures/systemd-unit-hardening-check/),
the tool that reads a `.service` file and its drop-ins and points at the lines that leave a
service running as root, unsandboxed or holding a password in `Environment=`. It ships twice: a
Python command-line tool (`check.py`) for repositories and CI, and a JavaScript copy
(`classify.mjs`) that runs on the web page. They are meant to give the same answer.

## The seeded faults

We seeded 18 faults across the two files, 8 into the Python and 10 into the JavaScript. The
tests caught 13. Three of the five that got through cannot change any output: a `rsplit("/", 2)[-1]`
that still returns the last path component, a sort comparator that returns 2 instead of 1
(sort only reads the sign), and a JavaScript read past the end of a string whose result never
reaches the report. The other two were real holes, and each now has a test:

- **A trailing backslash inside an open quote.** A unit file that ends in
  `Environment="DB_PASSWORD=x\\` keeps one backslash inside an unclosed quote once line
  continuations are joined. A bounds check written one character too loose makes the Python
  scan crash on it, stopping the whole run, and no test fed it that line.
- **Boolean flags with secret-looking names.** `Environment=PASSWORD_AUTH=no` is a switch, not a
  password. The code already skips `yes`/`no`/`true`/`false`/`on`/`off`/`0`/`1`, but no test said so,
  so turning one `or` into `and` would have flagged every such switch as a leaked secret.

Excluding the three that change nothing, the tests caught 13 of 15 faults before the new tests and
15 of 15 after.

## The real bug

Then we fed both copies 57 unit files a stranger might paste: quotes, continuations with a
comment in the middle, empty assignments that reset a list, `+`/`!`/`-`/`@`/`:` prefixes, CRLF line
endings, a docker launcher, and settings in unusual case. The two copies agreed on every one.
A couple of answers are deliberate limits (it judges the binary `ExecStart=` names, so
`/usr/bin/env /tmp/x` passes), but one contradicted both systemd and the tool's own rules.

The odd one out was this:

```ini
[Service]
DynamicUser=true
User=root
```

The checker reported no `svc-runs-as-root`. Its logic was "DynamicUser=yes means a throwaway
user", which is usually right. But the `DynamicUser=` entry in `systemd.exec(5)` says that if a
statically allocated user or group with the configured name already exists, systemd uses it
and allocates no dynamic one. `root` always exists. So this service runs as root, and the
checker said otherwise. Its own README table even listed `User=root` as a case it flags.

The fix is one line in each copy: when `User=` is set, it alone decides whether the service runs as
root; `DynamicUser=` only matters when `User=` is absent. The settings `DynamicUser=` implies
(NoNewPrivileges=, ProtectSystem=strict, a private /tmp) are still credited, because systemd
applies them either way. Failing tests came first, in both test suites.

## Keeping the two copies in step

A rule fixed in one copy and not the other is a bug waiting to happen, and the only existing
parity test ran five fixture files. The 57 cases are now a corpus (`parity-cases.test.json`) that
the JavaScript tests run through both copies, comparing every finding's line, type and severity.
To check it bites, we reverted the fix in the JavaScript copy alone: the parity test failed.

The checker reads files, not a running machine. A clean result is not an audit, and anything
guarding valuable data still deserves a review by someone qualified.
