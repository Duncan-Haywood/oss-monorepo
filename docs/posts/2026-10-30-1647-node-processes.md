---
title: "1,647 node processes to check some scripts"
date: 2026-10-30
description: "CI started node once per inline script, 1,647 times. One process does the same check in 1.8 s instead of 52 s."
tags: [performance, ci]
---

Our CI parsed every inline script on every venture page by starting `node
--check` once per script. 1,647 starts, 52 seconds, on every pull request.
One node process that screens them all, falling back to `node --check` only
for scripts it rejects, does the same job in 1.8 seconds with identical
verdicts. The cost was never the parsing; it was the process startup, paid
1,647 times.
