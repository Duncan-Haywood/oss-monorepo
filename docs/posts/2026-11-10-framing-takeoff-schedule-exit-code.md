---
title: "A report that says it failed should exit like it failed"
seo_title: "Wall framing takeoff CLI: --schedule exit codes fixed"
date: 2026-11-10
tags: [construction, cli, testing, open-source]
description: "Running every report flag of the wall framing takeoff CLI on one plan showed --schedule printed its error but exited 0, unlike --orders and --risk. Now it exits 1."
---

The [wall framing takeoff](../../ventures/wall-framing-takeoff/) command line
has about fifty report flags. Today's check was simple: run each one on one
small invented plan and compare exit codes.

Two flags, `--orders` and `--risk`, exited 1 when the plan had no usable
schedule. `--schedule` printed the same reason (in text, JSON with
`"ok": false`, or CSV) and then exited 0, so a script that ran it could not
tell success from refusal. It now exits 1 in all three forms, and a test pins it.

Small, but this is the kind of defect that only shows when the flags are compared
side by side. No real house was involved; the plan was invented.
