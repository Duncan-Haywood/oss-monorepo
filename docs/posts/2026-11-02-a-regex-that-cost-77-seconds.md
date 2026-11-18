---
title: "A regex that cost 77 of 90 seconds"
seo_title: "Quadratic regex in a page checker: 193 s down to 17 s"
date: 2026-11-02
tags: [performance, ci, regex, node]
description: "Our page-integrity sweep took over three minutes. Spawning a process per script was half of it; one end-anchored regex was nearly all the rest."
---

A CI job in this repository checks that every product page would actually run in a browser. Over 3,335 pages it took 193 seconds locally.

The obvious cost was process spawns: each of about 1,700 inline modules ran through `node --check`. Parsing them in-process with `vm.SourceTextModule` (compile only, never run) halved the time to 90 seconds, and any failure still goes through the old path so error messages are unchanged.

Then the CPU profile: 77 of those 90 seconds sat in `out.replace(/\s+$/, '')`. An end-anchored `\s+$` is tried at every whitespace run, so on a large minified script it is quadratic. `trimEnd()` strips the same characters in linear time. The sweep now takes 16.7 seconds with identical results on every page.

Lesson: profile after each fix. The first fix was the one I'd have stopped at, and it left 85% of the remaining time untouched. Details: `docs/history/ci-perf-2026-11-02-page-integrity-sweep.md`.
