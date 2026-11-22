---
title: "Our exports checker skipped targets Node rejects outright. A resolver tested against Node found it"
seo_title: "package.json exports: a resolver checked against Node 22"
date: 2026-11-22
tags: [developer-tools, node, npm, testing]
description: "Checked against Node 22 on 90,000 generated cases, our exports resolver showed the checker skipped targets that Node always rejects."
---

[package-exports-drift-check](https://marisstella.app/package-exports-drift-check/) reads a `package.json` `exports` map and tells you which targets point at files you don't publish. Until today it skipped two kinds of entry. A wildcard target such as `"./features/*": "./src/*.js"` was "not checked". A target such as `"./compat": "other-pkg/compat"` was labelled "a bare specifier re-exporting another package, nothing on disk to check".

The second label was wrong, and so was a test that called `"../outside.js"` a normal file target. Node accepts neither. Every `exports` target must start with `./`:

```
$ node -e 'require.resolve("q/re")'
ERR_INVALID_PACKAGE_TARGET  Invalid "exports" target "other-pkg/sub" defined for './re'
  in the package config .../q/package.json; targets must start with "./"
```

Only `imports`, the `#name` map, may point at another package. So the checker had been passing a package.json that fails every import through that subpath.

## How we found it

We wanted the tool to answer the question people actually ask: which file does `import "my-lib/feature"` reach? So we wrote Node's resolution algorithm into [`resolve.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/package-exports-drift-check/resolve.mjs). The steps come from the algorithm in Node's ESM documentation: PACKAGE_EXPORTS_RESOLVE, PACKAGE_IMPORTS_RESOLVE, PATTERN_KEY_COMPARE and PACKAGE_TARGET_RESOLVE. Then we checked it against Node itself.

[`resolve.diff.test.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/package-exports-drift-check/resolve.diff.test.mjs) generates packages from a seed. Each gets random `exports` and `imports` maps full of the shapes that go wrong: pattern keys of different specificity, nested conditions, fallback arrays holding invalid items, `null` blocks, `..`, `node_modules` and `%2e` segments, targets without `./`, numeric condition keys, and maps that mix `.` keys with condition keys. A child `node` then resolves the same specifiers three ways: ESM `import`, `import` with `--conditions=development`, and CommonJS `require`. The test compares the file or error code each one returns.

One detail makes ESM a precise oracle: `import.meta.resolve` returns the URL without opening the file, so nothing has to exist on disk. `require` does open the file, so for CommonJS we compare the path in its "Cannot find module" message.

On Node 22.23.5 the default seed gives **5,079 resolutions and 0 disagreements**. Seeds 1 to 5, at 1,000 packages each, gave between 17,019 and 17,166 resolutions each, also with **0 disagreements**. About a fifth of the cases resolve to a file. The rest end in one of Node's five resolution errors, so the error paths get as much testing as the successful ones.

## What the disagreements taught us on the way to zero

The first full run disagreed with Node on 272 of 5,079 cases. Some of those were bugs in the test's own generator. Fixing the rest taught us four things about Node 22:

- If `exports` is not a string, array or object (say `1` or `true`), Node reads it as **no `exports` at all** and falls back to `main`. It is not an error.
- With no `imports` field, `require("#x")` looks `#x` up as an ordinary package name and fails with "Cannot find module". `import "#x"` throws `ERR_PACKAGE_IMPORT_NOT_DEFINED` instead.
- An `imports` target of `""` is passed on as a package name.
- `#/x` is still an invalid specifier in Node 22.

## What changed in the tool

- Targets Node refuses are reported as **invalid**, with the reason. That covers a missing `./`, another package's name, `../`, an absolute path or URL, and a `.`, `..` or `node_modules` segment.
- Wildcard targets are matched against your file listing, with every `*` filled by the same text, as Node does. A pattern that reaches no file is reported. One that does shows an example, such as `./utils/format → ./esm/utils/format.js`.
- A map that mixes `"."` keys with condition keys is reported. Node throws `ERR_INVALID_PACKAGE_CONFIG` on every import of such a package.
- A new **resolve** panel, and `node cli.mjs resolve my-lib/feature --require --conditions=development`, show the file that wins and the key, condition and fallback that decided it.

Everything still runs in your browser, and nothing is uploaded. The tool checks what Node does. It is not a bundler, and a bundler adds its own conditions. You can type those conditions into the panel, but test a real install before you rely on any result.

*Written with AI assistance. The numbers above come from the test runs recorded in the [tool's README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/package-exports-drift-check#how-the-resolver-was-checked).*
