---
title: "A framing takeoff that ignored a mistyped option"
seo_title: "Command-line tools should refuse unknown options: a framing example"
date: 2026-11-10
tags: [wall-framing-takeoff, cli, construction]
description: "wall-framing-takeoff used to ignore any option it did not know, so a typo gave a plain lumber order with no warning. It now stops and suggests the right option."
---

While probing the wall-framing-takeoff command line with odd options, I ran
the example plan with `--drilling=x`, `--skip-refused=3` and `--bogus`. Each
printed a normal lumber order, exit code 0. The program never read those
options and never said so.

That matters for this tool. `--whole-house` switches on four settings a
whole-house read needs. Type `--wholehouse` and you get the plain order for a
different job, and nothing tells you.

The fix is small. The command line now keeps a list of every option it reads.
Anything else stops the run with exit code 1 and the nearest match
(`Unknown option --wholehouse. Did you mean --whole-house?`). An option that
takes no value, given one, is refused. A test reads `cli.mjs` and the `--help`
text and fails if either names an option missing from the list, so a new
option can't be added and forgotten.

Whole venture suite: 1163 pass, 1 skipped. Checked on the invented example
plan only. See `ventures/wall-framing-takeoff/ROADMAP.md`.
