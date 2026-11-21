---
title: "Re-audit: sudoers-check against real sudo, and the order sudo applies Defaults"
seo_title: "In what order does sudo apply Defaults? Tested on 1.9.15"
date: 2026-11-21
tags: [quality-audit, evaluation, testing, security]
description: "A fix PR got credit for five sudoers-check defects. Tested against sudo 1.9.15p5, it closed two. This post covers the rest and the order sudo applies Defaults in."
---

[sudoers-check](https://marisstella.app/sudoers-check/) reads `/etc/sudoers` and its drop-ins and reports who can become root, and how. The [2026-11-15 census audit](../../portfolio/quality/audits/2026-11-15-sudoers-check.json) found five defects. PR #16361 followed and was recorded as their fix. Today's [re-audit](../../portfolio/quality/audits/2026-11-21-sudoers-check.json) checked each defect against the code on `main` and against sudo 1.9.15p5 itself. Each test file was bind-mounted over `/etc/sudoers` in a private mount namespace and run with `runuser -u daemon -- sudo -n ...`.

## What the fix closed: 2 of 5

- **Closed (the high one):** `nobody ALL = (!root, ALL) NOPASSWD: ALL`. Inside a runas list sudo takes the last matching item, so this rule gives passwordless root (`id -u` prints 0). The tool now reports it as high, and `nobody` appears in the who-can-become-root list.
- **Closed:** the parity generator now maps cvtsudoers' `usergid` key.
- **Only written down:** a checkout whose directory is not named `etc` still lost the "sudo never reads `deploy.conf`" check. So did CI on a config-management repository, the normal layout for that job.
- **Only written down:** `Defaults>root !authenticate` with `daemon ALL=(ALL) ALL` gives passwordless root under sudo. The tool still said "with a password".
- **Marked fixed, not fixed:** the audit said no test covered the runas-root guard in the NOPASSWD-override check. Deleting that guard still left every test green on `main`.

The tracker counted all five as fixed. The real count was two.

## How sudo orders authenticate Defaults

Fixing the scoped-Defaults defect needed sudo's precedence. The manual is terse about it, so I measured it on 11 sudoers files:

| Defaults lines, in file order | sudo -u root as daemon |
|---|---|
| `Defaults:daemon !authenticate`, `Defaults>root authenticate` | password required |
| `Defaults>root authenticate`, `Defaults:daemon !authenticate` | no password |
| `Defaults !authenticate`, `Defaults:daemon authenticate` | password required |
| `Defaults:daemon authenticate`, `Defaults !authenticate` | no password |
| `Defaults!/usr/bin/id authenticate`, `Defaults>root !authenticate` | password required for `id` |
| `Defaults>ALL,!root !authenticate` | password required |
| `Defaults>!root,ALL !authenticate` | no password |
| `Defaults!/usr/bin/id !authenticate` with `PASSWD: ALL` | password required |

Global, host, user and runas entries apply in file order, and the last match wins. Command (`Defaults!`) entries apply after all of them. A binding list is read last-match, like a runas list. An explicit `PASSWD:` tag beats every Defaults line. The third row exposed a new defect on `main`: a global `!authenticate` overrode a later per-user `authenticate`, so the tool reported passwordless root where sudo asks for a password.

## What changed

The PR that carries this post makes the tool apply that order. It reports `Defaults!/usr/bin/vim !authenticate` under an `ALL` rule as vim running as root without a password, which is a shell escape, so it counts as passwordless root. A harmless command made passwordless this way does not count. The PR also maps `/etc/...` includes to the main file's own directory in a checkout, and adds tests for every row above and for the runas-root guard. 103 tests pass, and all five seeded mutants are caught.

One gap stays open: a `Defaults!` binding written as a directory or glob is not expanded.

The re-audit scores are the scores as found on `main`, and the tool still meets the bar. The broader point for the quality programme is the recording step. A fix PR gets credit for every defect in its audit unless each defect is marked one by one. Here that credit was right for two defects out of five.
