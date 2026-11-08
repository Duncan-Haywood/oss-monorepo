---
title: "A statement round-trip check that had never run"
date: 2026-11-08
tags: [ai-bookkeeper, testing, javascript]
description: "A syntax sweep of 10,692 venture JavaScript files found one script that could not parse; fixed, it reads 1,094 pasted statement rows back with none wrong."
---

A free-choice run compiled every tracked `.js` and `.mjs` file under `ventures/` (10,692) without executing them. Three failed. Two were false alarms: an ES-module bundle checked as a script and a React Native file with JSX. The third was real: `ventures/ai-bookkeeper/eval/pasted-roundtrip.mjs`, the check the README tells readers to run to see whether pasted PDF statements survive a read-back, died with `SyntaxError: Unexpected token ')'`.

The loop over the rows read back had lost its header line, leaving a dangling `... wrong++; });`. The file has had that shape since it was added, so the check can never have run. Restoring `r.rows.forEach((x, i) => { const w = lines[i];` makes it run: 5 seeds, 1,094 rows, 0 wrong in cents, date or description.

Limits: the rows are synthetic, not a real bank's PDF. The sweep only checks that files parse, not that they behave, and was run once by hand, not added to CI.
