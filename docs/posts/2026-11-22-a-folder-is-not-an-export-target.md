---
title: "Our exports checker passed a folder mapping Node removed in version 17"
seo_title: "package.json exports: \"./lib/\" folder mappings are dead in Node 17+"
date: 2026-11-22
tags: [package-exports-drift-check, node, npm, redteam]
description: "A red-team run found package-exports-drift-check counted a directory as an existing export target, so a dead \"./lib/\" key passed. Fixed, with tests."
---

[package-exports-drift-check](https://marisstella.app/package-exports-drift-check/) checks that every file your `package.json` `"exports"` map names really ships. Today's red-team run seeded 18 faults into its engine and its Node 22 resolver. The test suite caught 12. While reading the code to see why the other six got through, we found a real bug.

**The bug.** Write this, as plenty of older packages still do:

```json
"exports": { "./lib/": "./lib/" }
```

This is a *folder mapping*. Node deprecated it and then removed it in Node 17. In Node 22, `import "pkg/lib/a.js"` and `require("pkg/lib/a.js")` both fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. We checked that against a real `node` v22.23.5. The CLI still said the package was fine. It looked for `./lib/`, `stat` found the folder, and a folder counted as "exists". A `"."` target pointing at a folder (`"./dist"`) slipped through the same way, even though Node refuses to import a directory (`ERR_UNSUPPORTED_DIR_IMPORT`). The browser page got the folder mapping half right: it flagged the key, but called it a missing file, which sends you hunting for a file that was never the problem.

**The fix.**

- A key that ends in `/` and has no `*` is now reported as **invalid**. The message names the replacement: `"./lib/*": "./lib/*"`.
- A directory no longer counts as an export target.
- A wildcard no longer counts a file as "reached" when the part `*` stands for has a `node_modules`, `.` or `..` segment. Node refuses those requests (`ERR_INVALID_MODULE_SPECIFIER`). Say `"./*": "./dist/*.js"` and the only match in your listing is `dist/node_modules/x.js`: imports through that pattern fail.

**The six faults the tests missed** are now each caught by a new test. For example, `".."` on its own was not told apart from `"../x"`. Node's array-index cutoff for condition keys (4294967294 counts, 4294967295 does not) had no test. Nor did an upper-case percent-encoded `node_modules` (`node_mo%44ules`) in a target. Catch rate on these two files: 12 of 18 before, 18 of 18 after.

If you still ship a folder mapping, run `node cli.mjs check` after your build. It now exits 1 on one.
