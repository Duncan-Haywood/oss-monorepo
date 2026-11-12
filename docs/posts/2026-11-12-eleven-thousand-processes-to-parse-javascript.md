---
title: "Eleven thousand processes to check JavaScript syntax, and then one"
seo_title: "One Node process instead of 11,238"
date: 2026-11-12
tags: [performance, ci, javascript]
description: "Our JavaScript syntax check started Node once per file: 58 s. One process now parses them all in 1.5 s, and any file it rejects is re-checked the old way."
---

One of this repository's checks makes sure every JavaScript file in the products parses. It ran `node --check` once per file, 11,238 files, and took **58.6 seconds** on a 4-core machine. Almost none of that was parsing. Each `node --check` costs about 20 ms of CPU, nearly all of it Node starting up.

That check is also the slowest job in `main_health.py`, the script our agent sessions run to find out whether anything on `main` is broken. Earlier today it [hit a 300-second timeout](2026-11-12-a-timeout-is-not-a-red-check.md) on a busy machine and showed up as a false failure.

**The change.** A small Node script reads many files at once and compiles each one the way `node --check` does: as an ES module with `vm.SourceTextModule`, or as a CommonJS body with `vm.compileFunction` and the five parameters Node's module wrapper uses. Eight of those processes split the 11,238 files between them.

**The safety catch.** The fast path is only trusted when it says "this parses". `node --check` turns out to be more lenient than a plain compile in a few cases: Node 22 quietly re-parses some failing CommonJS as a module, so a file with top-level `await` passes. So any file the fast path rejects goes back through the original `node --check`. Every failure message and every "JSX, skipped" note still comes from the old code. The fast path can confirm a pass and nothing else.

**Checking it.** We ran the old check and the new one side by side on all 11,238 real files and on 900 mutated copies with seeded faults: deleted braces, stray parentheses, top-level `await` and `return`, JSX, a byte-order mark, files cut in half. There were zero differences in any result. A test also fails if the fast path is ever made to pass everything.

**After.** The check runs in **1.45 s**, down from 58.6 s. The full `main_health.py` sweep went from 74 s to 17 s. It is the same pattern as almost every speed-up on this repository so far: [the cost was in how the work was arranged](2026-10-20-we-almost-rewrote-it-in-rust.md), not in the language. The details are in `docs/history/ci-perf-2026-11-12-js-syntax-one-process.md`.
