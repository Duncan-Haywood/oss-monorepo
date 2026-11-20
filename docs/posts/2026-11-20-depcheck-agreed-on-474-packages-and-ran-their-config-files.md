---
title: "depcheck's answer on 474 packages in under three seconds, and five rules its README leaves out"
seo_title: "cyclehound --deps: depcheck's answer on 474 packages, in seconds"
date: 2026-11-20
tags: [cyclehound, rust, dev-tools, javascript, benchmarks]
description: cyclehound --deps matched depcheck 1.4.7 on 474 packages, 180 to 200 times faster on npm bundles, and never runs your config files.
---

[cyclehound](https://marisstella.app/cyclehound/) is our Rust import-graph checker. It already finds circular imports (madge's job) and unused exports (ts-unused-exports' job). Since it lexes every import in a project anyway, it can answer a third question: which packages does `package.json` declare that no file uses, and which packages do files import without declaring them? That is [depcheck](https://github.com/depcheck/depcheck)'s job. As of today it is `cyclehound --deps`.

## The comparison

A faster tool that finds different things is a different tool, so before writing the rules we read depcheck 1.4.7's source and copied them. `--depcheck` applies those rules and nothing else, and a script runs both tools on the same packages and compares the three lists package by package:

| | packages | depcheck findings | agree | depcheck | cyclehound `--depcheck` |
| --- | --- | --- | --- | --- | --- |
| this repository | 32 | 81 | 32 | 9.2 to 10.0 s, about 300 MB | 0.5 to 0.6 s, 23 MB |
| 153 npm packages as published | 442 | 5,184 | 442 | 341 to 369 s, 1.5 to 2.5 GB | 1.8 to 1.9 s, about 180 MB |

There is one caveat. depcheck's Babel parser rejected 56 files in the npm set, mostly `.d.ts` files with newer TypeScript syntax. A package used only in those files counts as unused to depcheck and as used to cyclehound, whose lexer never rejects a file. That covers 9 package names, and the script only accepts that explanation when every use cyclehound found is in a rejected file. Nothing else differs.

On this repository's small apps depcheck was never slow. On big published bundles it is, because it runs a full Babel parse of every file.

## Five rules the README leaves out

The first run agreed on 420 of 442 packages. Closing the gap meant finding what depcheck actually does:

1. **A relative import makes the package's own peers "used".** `import x from "./x"` becomes the package name `.`, and depcheck resolves `.` as a folder: the package itself. It then counts the package's own `peerDependencies` as used. So a package that lists a peer as a devDependency too, as styled-components does with `react-dom`, never sees it reported.
2. **A package's own name resolves to itself** when its package.json has `exports`, so rollup's own `bin` makes `rollup` count as used by its own scripts.
3. **Parentheses don't matter.** webpack writes `require(/** @type {string} */ ("webpack"))`.
4. **URLs are dropped only sometimes.** `import a from "https://..."` is ignored. `export * from "https://..."` and `import("https://...")` both report a missing package called `https:`.
5. **Type positions don't count.** `x: import("y").T` is not a use, and `import type ... from "x"` uses only `@types/x` when that is declared.

Matching these turned up a bug in our own lexer that the madge comparison never hit. In `o.else / e`, where a keyword is used as a property name and then divided, the `/` started a regex literal. In next's bundled copy of `@vercel/nft`, which is one line of minified code, that hid 22 of the file's 23 `require()` calls. The fix left the import graph of `ventures/` byte-identical.

## Two things depcheck gets wrong on a fresh clone

**Its answer depends on the machine.** depcheck resolves installed packages through `NODE_PATH`. In our container that points at a folder of globally installed tools, so depcheck called `eslint` or `typescript` "used" in 15 of the 32 packages because they were installed globally. With `NODE_PATH` cleared, it called them unused. Neither answer comes from the project.

**It runs the project's code.** Most of depcheck's "specials" `require()` the project's `webpack.config.js`, `jest.config.js`, `.babelrc.js` or `next.config.js` to read them. On your own code that is fine. On a package you are vetting, it executes that package. For the npm comparison we ran depcheck with only the two specials that read nothing but JSON. cyclehound never runs project code.

## The default mode

Without `--depcheck`, cyclehound adds a few guesses for a checkout with nothing installed. A script word that names the package counts as a use (`tsx --test`, `tsc` for `typescript`), and so does a config file named for a tool (`postcss.config.mjs`, `tsconfig.json`). It also reads object keys in config files (`plugins: { autoprefixer: {} }`), CSS `@plugin "@tailwindcss/typography"`, `// @vitest-environment jsdom`, and Next's need for `react-dom`. On this repository that takes depcheck's 81 findings down to 4, and we checked each of the 4 by hand:

- `ventures/ai-first-markets` declares `esbuild` and `@eslint/eslintrc`, which appear in no file but package.json;
- the marriage-and-divorce report app declares `@lexical/history`, which nothing imports (it arrives through `@lexical/react`);
- `ventures/local-site-studio` names `vite/client` in tsconfig `types` without declaring `vite`. It works only because vitest pulls vite in.

None of the four has been removed yet, since each needs a lockfile update in its own venture.

## Not the first in Rust

[depcheck-rs](https://github.com/Dominionys/depcheck-rs) (0.0.28 on crates.io) is a Rust port of depcheck, and skif and fallow cover knip's ground. We did not measure any of them: installing third-party crates was not allowed in this session. That comparison is the next one to make. Until then, the claim here is narrower: one binary that finds cycles, unused exports and dependency problems from the same lexer, and agrees with depcheck where depcheck can parse the file.

The rules, the guesses and what is not covered (Vue and Svelte files, and depcheck's twelve config readers) are in the [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/cyclehound#dependencies---deps). Every number above is in [BENCHMARK.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/cyclehound/BENCHMARK.md), with the script and the package list to rerun it.

*Written with AI assistance. depcheck, knip, depcheck-rs, skif and fallow are their authors' projects, and we are not affiliated with any of them.*
