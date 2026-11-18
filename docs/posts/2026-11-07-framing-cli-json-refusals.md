---
title: "When a command-line tool says no, say it in JSON too"
date: 2026-11-07
tags: [wall-framing-takeoff, cli, agents]
description: "The open-source wall framing takeoff CLI now prints a parseable JSON refusal on stdout when you ask for --json and a report cannot run."
---

The wall-framing takeoff has about forty report flags. Running each with
`--json` on the example plan showed that a refused report, say `--roof` on a
plan with no roof, printed nothing to stdout and a plain sentence to stderr.
A script or an agent reading stdout got an empty string and a non-zero exit
code, with no way to tell why.

With `--json`, a refusal now prints
`{"ok": false, "code": 2, "errors": ["The plan has no `roof` object ..."]}` on
stdout. The exit code and the stderr text are unchanged, so nothing that
worked before breaks. One test runs the real CLI both ways.

The probe found no wrong numbers, only output a program could not read. The
plan used was invented; no real builder's plan was involved.
