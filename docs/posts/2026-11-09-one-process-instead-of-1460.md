---
title: "One process instead of 1,460: parsing inline scripts in a batch"
date: 2026-11-09
seo_title: "Cutting a site check from 28 s to 17 s"
description: "The built-site check spawned one node process per inline script. One child that parses them all cut the step by 11 seconds; the old path stays as fallback."
tags: [performance, ci]
---

Every merge builds the catalogue, and a step then checks the output. One check
makes sure each inline `<script>` parses, because a page whose script has a
missing semicolon renders fine and does nothing. It did this by starting
`node --check` once per distinct script body: about 1,460 processes per run.

A CPU profile showed the time was in spawning and waiting on those children,
not in parsing. One child now compiles all of the bodies in-process (nothing
runs) and reports the ones that parse. A body it does not vouch for still goes
to `node --check`, so the pass/fail verdict and its message still come from
node. A local run of the step went from 28.2 s to 17.3 s, with identical output
and 97 passing tests. The CI figure will come from the next pool reading.

Details: `docs/history/ci-perf-2026-11-09-inline-parse-batch.md`.
