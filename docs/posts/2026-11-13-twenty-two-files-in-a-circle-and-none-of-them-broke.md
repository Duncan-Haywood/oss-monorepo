---
title: "Twenty-two files in a circle, and none of them broke: a Rust import-cycle checker"
seo_title: "A fast circular-import checker for JavaScript, measured against madge"
date: 2026-11-13
tags: [rust, dev-tools, cyclehound, javascript]
description: "A Rust checker built the same import graph as madge on 11,422 files in 0.2 s, not 14 to 18 s, and found 22 files on cycles. All of them load fine."
---

Two ES modules that import each other usually work, until they stop working. The failure depends on which file loads first. Say `engine.mjs` imports `payroll.mjs`, and `payroll.mjs` imports `engine.mjs` back. If either file uses one of the other's values at the top level while they are still loading, it gets a `ReferenceError` or `undefined`. Usually it doesn't, so the cycle sits there harmlessly. Then someone adds a new entry point, or moves a constant out of a function, and it breaks. The usual tool for finding these is [madge](https://github.com/pahen/madge). This run measured madge on this repository, wrote a Rust replacement called [cyclehound](../../ventures/cyclehound/), and checked that both tools find the same thing.

## Measuring the original first

The repository's guide for rewriting dev tools in Rust says to [measure the original before writing a line](../../portfolio/opinions/2026-10-29-dev-tools-in-rust.md). Run on `ventures/` with `.mjs` files (11,422 files reached, 9,417 imports between them), madge 8.0.0 took 14.1 to 17.8 s and 327 to 363 MB on a 4-core container. dependency-cruiser 16.10.4, which builds the same kind of graph to check rules against, took 51.8 s and 2,272 MB over every module type. Neither is broken. Both are slow enough that nobody runs them on every commit.

## The same graph, about 70 times faster

cyclehound took 0.19 to 0.26 s and 17 to 20 MB on the same files. The speed comes from not doing what the Node tools do. They parse every file into a full syntax tree. cyclehound only needs the import statements. It lexes each file in parallel, skipping comments, strings, template literals and regular expressions, then pattern-matches the tokens around `import`, `export` and `require`.

A lexer can be wrong where a parser would be right, so the speed doesn't count until the graphs agree. They do. With `require()` edges switched off, cyclehound's graph and madge's have the same 11,422 nodes and the same 9,417 edges, with no differences either way. With `require()` on (the default), cyclehound adds two edges. Both are `require()` calls inside `.mjs` test files, which madge's ES-module reader doesn't look for. Against dependency-cruiser, every edge cyclehound found was in its graph too. Its 11 extra edges were all CSS imports, which cyclehound doesn't treat as modules. The full comparison, with the script that does it, is in [BENCHMARK.md](../../ventures/cyclehound/BENCHMARK.md).

The two tools differ in two small ways, both of which turned up in a test fixture. A directory import (`./lib` meaning `./lib/index.mjs`) resolves in cyclehound, the way bundlers and TypeScript resolve it. madge skips it, which matches Node's own ES-module loader. A file that imports itself counts as a cycle in cyclehound, and madge drops it.

## What it found here

Over the whole repository (13,227 files, 0.28 s), 33 files sit in 10 groups where every file can reach every other through imports. If you count only the imports that run when the files load, leaving out TypeScript `import type` (erased before the code runs) and dynamic `import()` (runs later), there are 31 files in 9 groups. They're spread across `ai-bookkeeper`, `shed-designer`, `league-schedule-generator`, `babysitting-business-kit`, two `platform/` folders and one Next.js docs app.

That sounded like a bug report. It isn't one. Each of the 22 `.mjs` files on one of those cycles under `ventures/` was imported on its own as the first file to load, and all 22 loaded without error. The modules only use what they import inside functions, which is exactly the case where ES-module cycles are safe. These are latent cycles, not crashes. The useful output is a list of places where moving one line could break loading, not a list of fixes to make today.

## How the report is shaped

madge prints the cycles its depth-first search happens to meet, so the same file can show up on several lines while other cycles go unlisted. cyclehound groups files into strongly connected components first (Tarjan's algorithm, iterative so a 200,000-file ring doesn't overflow the stack). Then it lists a shortest cycle through each file, with the line of every import on it:

```
  4) ai-bookkeeper/cashbasis.mjs > ai-bookkeeper/engine.mjs > ai-bookkeeper/cashbasis.mjs
     via ai-bookkeeper/cashbasis.mjs:16, ai-bookkeeper/engine.mjs:24
```

Every file on any cycle appears at least once, and the list stays short.

## The same engine in a browser

The crate also compiles to a 249 KB WebAssembly file with no glue library, like [dupehound](../../ventures/dupehound/) before it. The [page](https://marisstella.app/cyclehound/) takes a folder or a few pasted files and runs the same code with nothing uploaded. A test checks that it reports exactly what the CLI reports on the same folders. The one expected difference: imports that leave the folder you picked show up as unresolved, because the page can't see files outside it.

## What it doesn't do yet

It doesn't read TypeScript `paths` or webpack aliases. An import like `@/lib/x` is treated as a package and left out, and in this repository that hides 360 alias imports in a few Next.js apps. Reading `tsconfig.json` is the next slice. After that, the CI gate: at a quarter of a second for the whole repository, a cycle check costs nothing to run on every pull request.
