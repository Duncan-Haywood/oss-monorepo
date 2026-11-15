---
title: "Unused exports in a third of a second, and where two tools disagree"
date: 2026-11-15
tags: [cyclehound, rust, dev-tools, javascript, benchmarks]
description: cyclehound now finds exports nobody imports. On 11,736 files it took 0.3 s against ts-unused-exports' 11 s, and every disagreement was checked.
---

[cyclehound](https://marisstella.app/cyclehound/) began as a circular-import checker written in Rust. It already builds the whole import graph of a JavaScript or TypeScript project in a fraction of a second, so it can answer the next question too: which exports does nobody import? That is the job of [ts-unused-exports](https://github.com/pzavolinsky/ts-unused-exports) and of knip's unused-exports check. As of today it is `cyclehound --unused-exports`.

We ran it on this repository's 11,736 `.mjs` files under `ventures/`, on a 4-core container:

| | wall time | peak memory | findings |
| --- | --- | --- | --- |
| ts-unused-exports 11.0.1 | 10.7 to 11.4 s | 368 to 390 MB | 6,222 |
| cyclehound | 0.31 to 0.33 s | 29 to 30 MB | 5,470 |

The two agree on 5,419 (file, name) pairs. A faster tool that finds different things is a different tool, so we went through every disagreement, using a script for the bulk and reading the source for the rest.

**527 come from a choice we made.** `const calc = await import("./calc.mjs")` loads a module whole, and the code can then read any member, including by computed name. cyclehound counts that as taking every export; ts-unused-exports reports the exports as unused. Here most of these are page tests that check *every* name an inline script imports exists, so treating them as used is right. In other code the same rule could hide a real unused export, and the README says so.

**252 were false positives from ts-unused-exports.** `const { replay } = await import("./x.mjs")` inside a test function takes `replay`. cyclehound reads the destructured keys. ts-unused-exports reported those names as unused, and a two-file case reproduces it.

**37 were exports only cyclehound found.** In `export const INVENTORY_ACCOUNT = "1450", COGS_ACCOUNT = "5000";`, importing the first name was enough to stop ts-unused-exports reporting the second (36 cases; one more is a name inside an exported destructuring pattern). Ten more sat behind an `export *` in `shift-roster-builder`: `server.mjs` re-exports all of `hub.mjs`, and the only file that imports `server.mjs` takes four names. The other ten exports of `hub.mjs` really are unused.

The rest are small: 21 more whole-module dynamic imports written other ways (`Promise.all([import(...)])`), 6 in cyclehound's own test fixture, and one name the two tools spell differently. The full list is in [BENCHMARK.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/cyclehound/BENCHMARK.md).

Why Rust here? The check needs the import and export statements and nothing else. cyclehound's lexer skips comments, strings, template literals and regexes correctly, and never builds a syntax tree. The analysis is then a worklist over the graph: each import asks its target for names, and each `export { a as b } from` or `export *` passes the request on.

Limits: it does not read CommonJS `module.exports`, it does not track which members of a namespace import are read, and files nothing imports count as entry points and are skipped unless you pass `--entries`. Next come TypeScript `paths` aliases, so `@/lib/x` imports count too.

Built with AI assistance. ts-unused-exports is its authors' project; cyclehound shares no code with it and is not affiliated with or endorsed by it.
