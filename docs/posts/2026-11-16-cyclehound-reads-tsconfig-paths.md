---
title: "1,436 imports our cycle checker couldn't see"
seo_title: "Resolving tsconfig paths aliases in Rust, checked against TypeScript"
date: 2026-11-16
tags: [ventures, cyclehound, rust, dev-tools, typescript]
description: "cyclehound now follows tsconfig path aliases like @/lib/x, and TypeScript 5.9's own resolver sends the same 1,436 imports to the same files."
---

[cyclehound](https://marisstella.app/cyclehound/) is the portfolio's Rust
import-graph checker: it finds circular imports and unused exports in a
JavaScript or TypeScript tree in a fraction of a second. Until today it had
a blind spot. Next.js projects write `import { db } from "@/lib/db"`, and
`@/` means nothing to Node: it is an alias set in `tsconfig.json`'s `paths`.
cyclehound treated every such import as a package and skipped it, so in
those apps it couldn't check any edge that went through an alias.

## What changed

cyclehound now reads the nearest `tsconfig.json` above each file (or a
`jsconfig.json`), follows `extends`, and applies `paths` and `baseUrl` the
way the TypeScript compiler does:

- an exact pattern beats a wildcard, and among wildcards the longest prefix
  wins (`@app/ui/*` before `@app/*`);
- targets are tried in order, relative to `baseUrl`, or to the config that
  set `paths` when there is no `baseUrl`;
- a target inside `node_modules` or a `.d.ts` file is package typing, not
  project code, and stays out of the graph;
- an alias that matches a pattern but points at no file (`@/lib/gone`) is
  now reported by `--unresolved`, since TypeScript would refuse it too.

tsconfig files allow comments and trailing commas, so the crate has a small
tolerant JSON reader rather than a dependency. `--no-tsconfig` turns all of
this off.

## Checked against TypeScript itself

A faster tool that resolves differently is a different tool, so the
reference is the compiler. A short script
([`tests/bench/ts_alias_edges.cjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/cyclehound/tests/bench/ts_alias_edges.cjs))
takes every file in cyclehound's graph of `ventures/`, loads its config with
TypeScript 5.9.3's API, and resolves each of the 2,502 bare imports with
`ts.resolveModuleName`. The output:

```
cyclehound alias edges 1436 typescript 1436 common 1436
```

The two tools agree on every alias edge, across 16 configs. The graph grows
from 11,560 edges to 12,996, and the run time doesn't change measurably
(0.25 to 0.28 s on `ventures/`, about 20 MB).

## What the new edges showed

No new cycles: the same 12 circular groups and 37 files as before, so the
Next.js apps here were not hiding a loop behind `@/`. The unused-export
report did change. It dropped from 5,648 findings to 5,540, because 108
exports were only "unused" in the sense that every file taking them did so
through an alias cyclehound couldn't follow. Those were false alarms, and
they're gone.

## Limits and next

Webpack and Vite aliases live in JavaScript config files and are still not
read. The config search walks up the paths as given, so run it from the
project root or above. Next on the list is the CI gate: running cyclehound on
this repository's pull requests so a new cycle fails the build. The full
numbers are in the
[benchmark](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/cyclehound/BENCHMARK.md).
