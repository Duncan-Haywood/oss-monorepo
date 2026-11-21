---
title: "Which copies does a test keep in sync? Asking dupehound to guess"
seo_title: "Find vendored copies with no sync test: dupehound --suggest-guards"
date: 2026-11-21
tags: [dev-tools, rust, duplicate-code, testing, dupehound]
description: "dupehound now drafts its own guard file from whole-file identical copies. On this repository: 20 groups unguarded, one with a test, one PDF parser now synced."
---

[dupehound](../../ventures/dupehound/README.md) groups copy-pasted code into families and ranks them by how many lines a shared module would remove. Some copies are deliberate, though. A module gets vendored into each project, and a test fails when one copy drifts. Since 2026-11-12, `--guarded FILE` folds those copies into one, so they stop crowding the top of the table. The catch is that someone had to write that file by hand.

**The new flag drafts it.** `dupehound --suggest-guards` looks inside each family for copies that are whole files and token-identical to each other. That is what a vendored module looks like, and also what a file looks like that was pasted once and never edited since. Copies are grouped by depth and file name. Path segments that agree are kept and segments that differ become `*`, so 122 copies of `proposal.mjs` come out as one line. A partial stray (one helper pasted into an unrelated file) stays out of the pattern and is counted in the comment above it. A glob that would also match some other scanned file is replaced by the exact paths, so a confirmed line never folds a copy nobody watches. The output is a guard file to edit, not a verdict.

**On this repository** (13,534 `.mjs` files under `ventures/` and `platform/`, about 1.6 s) it proposed 25 patterns. The top five matched the hand-written guard file for the copies `platform/proposal/sync.test.mjs` keeps identical. The one entry it could not find is `platform/proposal/terms.test.mjs`, whose import line the sync test rewrites, so that copy is not identical. With the existing guard file applied, 20 patterns remained, and I checked each one for a test that compares the copies:

| suggested | copies | sync test? |
|---|---|---|
| `byok.mjs` | 17 | yes, `platform/llm/byok.test.mjs` |
| `repair-fuzz.test.mjs` | 50 | a thin wrapper around `platform/fuzz/`, by design |
| `pdf-parser.mjs`, `inflate-browser.mjs` | 4 each | **none** |
| 16 others (`greenbutton.mjs`, `licence.mjs`, `yaml.mjs`, `search.mjs`, seven `page.test.mjs`, ...) | 2 to 37 | none found |

So as a guess at "vendored on purpose and guarded", it scored one in twenty. As a list of identical copies nobody watches, it is exactly what a reader would want. The most worrying entry was the PDF parser. Four ventures (bank-statement-pdf-to-csv, drawing-set-index, pdf-accessibility-tag-check and submittal-register) carry the same 344-line parser for uploaded files. A fix to one copy would have reached none of the others. Each of the four now carries the same `pdf-parser-sync.test.mjs`, which fails its own suite when any copy (the test included) differs from a sibling. I checked it by appending a line to one copy: the test failed and named that venture. The copies are in the guard file now, and with it applied, 17 patterns are left.

**Not done.** A tool can't tell a vendored module from a forgotten paste on its own. The next step is to look for the sync test itself: a test file that names the copy and reads its siblings. The browser page does not have the flag yet. The numbers above come from one commit (`284dedfe`) and one run; the README has the command to reproduce them.
