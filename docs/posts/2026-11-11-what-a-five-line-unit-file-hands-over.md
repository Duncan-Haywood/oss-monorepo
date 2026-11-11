---
title: "What a five-line unit file hands over: a free systemd hardening checker"
seo_title: "Free systemd service hardening checker: root, ProtectSystem, secrets in Environment="
date: 2026-11-11
tags: [systemd, linux, security, self-hosting, devsec, open-source]
description: "A new open-source tool reads a systemd .service file and its drop-ins, flags root services, missing sandboxing and secrets in Environment=, and writes a starter hardening drop-in. We ran it on the repository's own two units first."
---

The [systemd Unit Hardening Check](../../ventures/systemd-unit-hardening-check/)
is a new free tool in the devsec set. Paste a `.service` file and its drop-ins
(or point the CLI at `/etc/systemd/system/`) and it lists what the service can
do to the rest of the machine, line by line, then writes the drop-in that would
take most of it away.

## Why this one

The portfolio already checks Docker Compose files, Kubernetes pods and GitHub
Actions workflows for the settings that hand a workload the host. Nothing read
the plainest way to run a program on a Linux server: a unit file. The usual
one is five lines, an `ExecStart=` and a `Restart=always`, and it runs as root
with the whole filesystem writable, every device visible and every system call
allowed. systemd can wall that off with a dozen lines, at no run-time cost, but
the settings are spread across a long manual and each one can break a service
that needs what it removes.

`systemd-analyze security` already scores units, but only ones loaded on a
running machine. This tool reads the files, so it works on a unit in a
repository, an Ansible template or a container image before anything is
deployed, and it points at the line to change. It does not reproduce
systemd-analyze's score and says so.

## What it reads

Seventeen finding types in three bands. The high ones are things written into
the unit: a password in `Environment=` (the systemd.exec manual says
environment variables are not suitable for secrets, because a unit's
environment is visible to unprivileged users over D-Bus), a binary under `/tmp`
or, for a root service, under `/home`, `curl … | sh` in an `ExecStartPre=`,
near-root capabilities such as `CAP_SYS_ADMIN`, and `ReadWritePaths=/`. The
medium ones are the big missing walls: running as root, `NoNewPrivileges=`,
`ProtectSystem=`, `ProtectHome=`. The low ones are the rest of the usual
sandbox.

Two details make it more than a grep. Drop-ins are merged the way systemd does
it: the unit first, then `NAME.service.d/*.conf` in file-name order, the last
assignment winning and an empty one (`Environment=`) resetting a list. And
`DynamicUser=yes` is credited with what the manual says it implies
(`NoNewPrivileges=`, `ProtectSystem=strict`, `ProtectHome=read-only`, a private
`/tmp`), so a unit that uses it is not told to add them. The first draft also
assumed that `SystemCallFilter=` and similar settings
switch `NoNewPrivileges=` on; the current manual does not say that, so the tool
no longer assumes it.

## What it found in this repository

The repository ships two unit files, so they went first.

- `ventures/ubuntu-agent-server/.../agent-runner.service.j2`, the unit that
  polls repos and runs coding agents, already runs as its own `User=`. It has
  no `NoNewPrivileges=`, `ProtectSystem=` or `ProtectHome=` (three medium
  findings) and none of the low-band sandbox settings (five more). For a
  service whose whole job is running code an agent wrote, those are worth
  having, but each one needs testing on a real server, because the runner may
  write outside `/srv/agents` or use Docker. This run did not change the unit;
  it is now a known item rather than an unknown.
- `ventures/ig-media-pipeline/deploy/igmp-worker.service` runs as root with no
  sandbox at all, and the first version of the checker reported nine findings
  for it. They were misleading. The unit's `ExecStart=` is `docker run`, and
  dockerd starts the container outside the unit, so `ProtectSystem=` and
  friends would confine only the Docker client. The checker now recognises a
  container-launcher unit (docker, podman, nerdctl), says once that its
  isolation comes from the runtime's own options, still reports anything risky
  written in the unit, and skips the sandbox list. The worker's secrets are in
  a 0600 `--env-file`, not in `Environment=`, so nothing high came up.

The second unit is the more useful result: a checker that lists nine
fixes nobody should make is worse than none.

## How it was checked

39 tests: 16 Python, 23 Node (9 of those the shared usage-counter tests). A parity test runs the Python CLI and the
browser port over the same fixtures (CRLF line endings, quoting, a lone
drop-in, a template unit, the Docker wrapper) and requires identical findings
and drop-ins. The guide's worked example is compared with the CLI's real
output in a test, so the page cannot drift from the code. The page was driven
in Chromium at phone width; the findings table now stacks into cards below 640
pixels, after the first screenshot showed file paths broken one character per
line.

## Next

`.socket` units (`ListenStream=` on every interface) and `.timer` units are
the obvious next readers, then an entry in
[devsec-toolkit](../../ventures/devsec-toolkit/) so it runs with the other
checks over a whole repository.

*Free, no warranty, not a security audit. A clean result is not proof a service
is safe, and the starter drop-in can stop a service from working until you
test it.*
