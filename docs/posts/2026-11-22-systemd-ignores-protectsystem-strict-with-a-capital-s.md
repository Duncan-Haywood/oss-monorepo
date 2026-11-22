---
title: "systemd ignores ProtectSystem=Strict with a capital S, and so should a checker"
seo_title: "Why systemd ignores ProtectSystem=Strict and other unit values"
date: 2026-11-22
tags: [systemd, security, differential-testing, dev-tools]
description: "A systemd hardening checker against systemd-analyze on thousands of random units: 38% disagreed at first, mostly over values systemd drops."
---

Our [systemd unit hardening check](../../ventures/systemd-unit-hardening-check/)
reads a `.service` file and its drop-ins and says which sandbox settings are
missing: `NoNewPrivileges=`, `ProtectSystem=`, `ProtectHome=`, `PrivateTmp=` and
six more. It was written from the systemd.exec(5) manual. Its Python and browser
versions were already fuzzed against each other, so they agreed. Nothing yet
checked that they agreed with systemd.

systemd ships that check itself. `systemd-analyze security --offline=yes
--json=short app.service` loads the file, and the `app.service.d/*.conf` drop-ins
beside it, with the same parser the service manager uses. It needs no running
systemd and takes about 8 ms per unit. For ten of our eighteen finding types it
reports the same fact, for example whether `NoNewPrivileges=` is in force. So we
generated random unit trees and asked both.

## First run: 1,455 of 3,797 trees disagreed

The generator is unkind on purpose. It uses odd boolean spellings, wrong-case
keys and section names, invalid and empty values, CRLF line endings,
continuation lines and up to three drop-ins. On a seed we had not used while
fixing anything, the original code disagreed with systemd 255.4 on at least
one finding in 38% of the trees systemd could load. The causes, from probing
one setting at a time:

- **A value systemd cannot parse is dropped, and the previous one stands.**
  systemd logs `Failed to parse boolean value, ignoring` and moves on. We took
  the last line as written. So `NoNewPrivileges=yes` followed by
  `NoNewPrivileges=maybe` read as "off" to us and "on" to systemd. An empty
  `ProtectSystem=` after `=strict` also leaves it strict.
- **`ProtectSystem=` and `ProtectHome=` words are case-sensitive.** Booleans
  are not: `YES` works. `strict`, `full`, `read-only` and `tmpfs` work only in
  lower case. `ProtectSystem=Strict` is rejected, so the service keeps full
  write access to `/usr` and `/etc`. We lower-cased the value and reported the
  unit as protected. This was the worst one: a clean report for a unit with no
  protection at all.
- **systemd's booleans include `y`, `t`, `n` and `f`.** We knew only `1`, `yes`,
  `true` and `on`. That gave false alarms on units that were fine.
- **A trailing comment is part of the value.** `NoNewPrivileges=yes # sandbox`
  is not a boolean. That one we already got right, by accident.
- **An invalid `DynamicUser=` is fatal.** In the unit file itself, the unit
  will not load. In a drop-in, systemd 255 stops reading that file at that line,
  so every line after it is lost. A hardening drop-in that starts with
  `DynamicUser=yes # throwaway user` loses everything below it.
- **`[ Service ]` with inner spaces is a different section.** We trimmed it.
- **List settings have modes.** In `SystemCallFilter=` and
  `RestrictAddressFamilies=`, a lone `~` is an empty deny list, which filters
  nothing. `RestrictAddressFamilies=none` allows no families. The allow-or-deny
  mode is set again only after the list is freed (by an empty value or `none`),
  not every time it becomes empty. Our first guess at that rule was wrong, and
  the next run showed it.

## After the fixes

Both versions of the checker now parse values the way systemd 255 does. A
finding caused by an ignored line points at that line and says why:
"systemd ignores ProtectSystem=Strict: it is not a value systemd accepts, so
the earlier ProtectSystem=full stands." On five new seeds (19,082 loadable
trees), 63 still disagree. Every one is a deny list made only of system call or
address family names systemd does not know, such as `~AF_BOGUS`. systemd drops
unknown names, so the list ends up empty. We do not check names, and the README
says so. The harness labels a difference that way only when systemd itself
printed an unknown-name warning for that tree. Anything else counts as a
failure.

The harness is [`eval/systemd-analyze-diff.mjs`](../../ventures/systemd-unit-hardening-check/eval/systemd-analyze-diff.mjs).
A 400-tree version runs with the tests wherever systemd-analyze 250 or later is
installed, and skips where it is not.

## What this does not show

These are random units, not real ones. The 38% says how often the generator
hits these gaps, not how often your units do. The three cases most likely in
real files are a capitalised `Strict` or `Read-Only`, a `# comment` after a
value, and a `y` or `t` copied from a config generator. The test covers ten
finding types and no others. Secrets in `Environment=`, binaries under `/tmp`
and `curl | sh` have no systemd-analyze counterpart. A match with systemd also
does not make a unit safe. It means we now read the file the way systemd does.
