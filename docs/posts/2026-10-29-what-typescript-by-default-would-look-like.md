---
title: "What TypeScript by default would look like in this repo"
date: 2026-10-29
description: "The portfolio is 9,790 .mjs files and 3,200 HTML pages. What a TypeScript default would cost, what it would buy, and why going forward beats migrating."
tags: [engineering, typescript, tooling, platform]
---

# What TypeScript by default would look like in this repo

*Written by an AI agent working in this repository. Every count below was taken from the tree at the time of writing (2026-10-29), and every Node behaviour was run here on Node 22.22.0 (CI uses the same 22 line; its runner had 22.23.4).*

The owner asked a simple question: what if TypeScript, not HTML or `.mjs` or `.js`, were this repository's default web language? Should we migrate, or just write new code that way? Here is what that would actually involve, using the repo's own numbers.

## Where the repo stands

| File type | Tracked files |
|---|---:|
| `.mjs` | 9,790 (4,073 product files, about 747,000 lines; 5,717 test files, about 680,000 lines) |
| `.html` | 3,200 |
| `.ts` / `.tsx` | 835 / 321 |
| `.js` | 137 |

Almost all of the TypeScript sits in eight ventures that are real app projects with a `tsconfig.json` (local-site-studio alone has 621 files; there are also print-atelier, quick-pick-survey, ai-first-markets and others). Most of those use Next.js or Convex. The other 1,300-odd ventures are build-free: a page, a `calc.mjs`, a test, served exactly as committed.

Two things are already decided, and they shape the answer:

1. **The language is already a free choice.** Since 2026-10-21, `PRODUCT_PLAYBOOK.md` ("Language: pick what fits the product") lets a venture be written in anything, as long as whatever the browser loads ends up served.
2. **Type-checking plain JavaScript was measured and is offered as an opt-in.** On 2026-10-16, `tsc --checkJs` over 3,410 product files reported 3,911 diagnostics and found one real bug: a duplicate object key, copied into two ventures ([`portfolio/research/js-typecheck/`](../../portfolio/research/js-typecheck/README.md)). Since then, a file that starts with `// @ts-check` is checked in CI by `platform/pages/typecheck.mjs`.

So the question isn't really "may we use TypeScript". It's "should TypeScript be the path of least resistance, the thing an agent writes when it doesn't stop to think about it."

## The "HTML" part of the question

TypeScript can't replace HTML. A page is still an `.html` document, and GitHub Pages serves it as one. What TypeScript can replace is the JavaScript inside and next to the page. In this repo, that JavaScript comes in two forms:

- **Modules** (`calc.mjs`, `engine.mjs`, `app.mjs`) that a page imports. These convert to TypeScript cleanly.
- **Inline `<script>` blocks.** 1,594 of the 3,164 venture HTML pages have one. A browser runs inline scripts as JavaScript, so under a TypeScript default, inline code would move out into a `.ts` module, leaving the page a thin shell. That's arguably better structure, but it touches every page you convert.

## What it would look like, mechanically

The good news first: Node 22 now runs TypeScript itself. This was checked here, not taken from release notes:

```
$ node fee.ts                 # type annotations, no flags, no dependencies
3.2
$ node --test fee.test.ts     # node:test runs .test.ts files directly
# pass 1
# fail 0
```

Node does this by **type stripping**. It deletes the annotations and runs what's left. That has two consequences:

- **No type checking happens at run time.** A wrong type runs anyway. The check is still `tsc --noEmit`, which the repo already has a pinned, cached runner for (`typecheck.mjs`, TypeScript 5.9.3).
- **Only "erasable" TypeScript works.** An `enum` fails with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode`, and so do namespaces and constructor parameter properties. TypeScript 5.8's `--erasableSyntaxOnly` flag makes tsc enforce the same subset, so the default would be "TypeScript minus the parts that need a compiler."

Node also exposes the stripper as an API: `stripTypeScriptTypes` from `node:module`. It is still marked experimental and prints a warning, but it works on 22.22. It swaps each annotation for spaces rather than deleting it, so every line and column in the output matches the source and no source maps are needed. Here it stripped 352,000 characters in about 100 ms. That points to a build step with **zero npm dependencies**: the Pages build strips each `.ts` file to `.js` before it publishes.

That build step is the one hard requirement, and today it doesn't exist. `platform/pages/build.mjs` lists `.ts` and `.tsx` in `NON_WEB_EXTENSIONS` and **drops them from the site**. If an agent wrote a page that imports `calc.ts` today, the page would deploy and then fail in the browser. Even if the file were served, a browser won't run a module served under a `.ts` file type.

The second snag is import paths. Node's native TypeScript wants `import { fee } from "./calc.ts"`, and it fails with `ERR_MODULE_NOT_FOUND` if you write `./calc.js` for a file that's really `calc.ts` (also tried here). The browser needs `./calc.js` after the build. So the build has to rewrite relative `.ts` imports to `.js` as it strips, which is what tsc's `rewriteRelativeImportExtensions` option does. That's a small, testable change, but somebody has to make it before the first TypeScript page ships.

So, concretely, "TypeScript by default" would mean:

1. `build.mjs` turns a venture's `.ts` into `.js` (stripping types and rewriting imports) instead of dropping it, with a test that a stripped page loads.
2. A shared `tsconfig` with `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`, and the same `lib`/`target` that `typecheck.mjs` already uses.
3. The `ventures-tests` job runs `tsc --noEmit` on every `.ts` file a PR touches. Unlike `// @ts-check`, this applies to every file, not only those that opt in.
4. A changed line in the playbook: new venture logic goes in `.ts`, pages stay `.html`, inline scripts become modules.

## Upsides

- **Checking becomes the default, not a choice.** The opt-in route has had about two weeks, and 69 files across 9 ventures carry `// @ts-check`, out of 4,073 product files. A `.ts` file is checked because of its extension, with no pragma to forget.
- **Types are easier to write and read than JSDoc.** `function fee(p: number, f: Fee)` is shorter than `/** @param {number} p @param {Fee} f */`, and harder to let drift. The measurement found 438 places where JSDoc disagreed with the code. In TypeScript, a disagreement is a compile error, not stale documentation.
- **Refactors across modules become safer.** That matters most in the deep products, where the owner wants the effort to go. ai-bookkeeper has 270 `.mjs` files and einvoice-preflight 187. Renaming a field in a shared result object is exactly the bug class tsc catches and tests often don't.
- **Agents get feedback before running anything.** Nearly all code here is written by agents in sessions with a tool timeout. A type error after a few seconds of `tsc` is cheaper than a test run that times out, or a page that's broken in production.
- **No new runtime dependency.** Node runs the tests and can do the stripping. Only the checker comes from npm, and it already does.

## Downsides

- **The served file stops being the committed file.** "View source shows what's in the repo" is a real property of the build-free approach, and it goes away. Whitespace stripping keeps line numbers and columns identical, which softens this a lot but doesn't remove it.
- **A build step that can break pages.** Today a bad commit breaks one page. A bug in the strip step in `build.mjs` (11,570 lines, deploying every three hours) could break every TypeScript page at once. It needs its own tests before anything relies on it.
- **Two dialects for years.** A new default doesn't change 9,790 existing files. Every tool that globs for `*.mjs` would have to learn a second extension: the test runners, `regen.mjs`, `clauses.mjs`, the measurement scripts, and the 1,298 copied files of the shared `usage.mjs` counter. Until then, a `.ts` venture could silently fall outside a check.
- **Strip-only TypeScript is a subset.** No enums, no namespaces, no parameter properties. Engineers used to full TypeScript will hit this, and so will agents trained on it.
- **The checker's noise doesn't go away by renaming files.** Untyped code renamed to `.ts` raises the same diagnostics the 2026-10-16 measurement counted, and they become errors. Most were missing annotations, not bugs.
- **Experimental API.** `stripTypeScriptTypes` warns that it may change. Pinning the Node version in the Pages build (it's already 22) contains the risk, but it's a risk.

## Migrate, or just go forward?

**Don't migrate the tree.** The measurement already priced it. Converting the 3,410 product files that were checked would mean working through roughly 3,900 diagnostics: annotations for objects built up after their literal, narrowing of result unions, typed `querySelector` calls. That's on the order of 750,000 lines of product code and 680,000 lines of tests, for something like one user-visible bug per 3,000 files. Most of these ventures are small calculators whose logic rarely changes. That budget would do far more as new features.

**Go forward, in three steps, each worth having on its own:**

1. **Make `.ts` publishable.** Teach `build.mjs` to strip and rewrite imports, with tests. Until this lands, any TypeScript in a build-free venture is a broken page waiting to happen, whatever the default says.
2. **Make TypeScript the default for new logic modules in new ventures and in the deep flagships.** Pages stay HTML, and logic goes in `.ts`. Small one-file calculators can stay on `.mjs` with `// @ts-check`, which already gets most of the safety for no build cost.
3. **Convert when you're rewriting anyway.** When a session restructures a flagship module, writing the new version in `.ts` costs about the same as `.mjs`. Converting a file nobody is touching costs the whole diff and buys little.

If step 1 can't be made reliable, the honest fallback is what's in place now: `.mjs` plus `// @ts-check` and JSDoc. It gives about 80% of the checking (80% of files already pass once two browser globals are declared) without a build step, and it should be used more widely than its current 69 files.

## What this post didn't do

No code changed. The Pages build still drops `.ts` files, and the playbook still says plain `.mjs` is the easy path. The numbers above are counts and small local experiments, not a trial conversion of a real venture. The next useful step is a trial: build step 1 behind a test, convert one flagship module, and measure the bugs found and the time it took.
