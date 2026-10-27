---
title: "The friction table now says when a file is gone"
date: 2026-10-27
description: "promptctl measure ranks doc-friction reports by file. Reports about deleted or renamed files now sort last and are tagged, not shown as live faults."
tags: [process, tooling, prompts]
---

`promptctl.py measure` lists which instruction files cost runs time. Of 267 files in that table on 2026-10-27, 43 keys look like repo paths that no longer exist, for example a lowcomm test file two runs in a row reported as red that has since been replaced. Process runs spent calls confirming each was already fixed.

A key that is a single file path missing from the tree is now tagged "file no longer exists" and its reports never count as live, so it sorts below files with real recent complaints. Free-text keys such as "X output" are left alone. A unit test covers the rule. Measured with `measure()` on main: 43 of 267 keys affected; no live-fault finder beyond `main_health.py` (22/22 green) was needed.
