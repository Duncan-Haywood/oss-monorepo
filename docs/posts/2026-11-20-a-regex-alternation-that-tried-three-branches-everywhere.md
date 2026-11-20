---
title: "A regex alternation that tried three branches at every character"
seo_title: "Python re alternation slow: split it behind literal prefilters"
date: 2026-11-20
tags: [performance, python, regex, ci]
description: "One CI check spent 1.4 s matching a three-branch regex across 7,000 files. Splitting it behind substring tests made the check 3.5 times faster with identical output."
---

Every pull request that touches a product in this repository runs a check that
looks for CSV exporters without a spreadsheet formula-injection guard. It took
about 3 seconds. It now takes 0.85 s and reports exactly the same 355 files.

Half the time was one regular expression:

```
function\s+toCsv\b|\btoCsv\s*=\s*(...)|export\s+(async\s+)?function\s+...Csv\s*\(
```

Python's `re` module can jump straight to candidate positions only when a
pattern starts with a fixed string. An alternation whose branches start with
`function`, a word boundary and `export` has no single prefix, so the engine
tried all three branches at every character of every `.mjs` file: 7,229
searches, 1.4 seconds.

The fix keeps the meaning. An alternation matches somewhere exactly when one of
its branches does, so we test the branches one at a time, each behind a plain
substring test it cannot match without: no `Csv` in the file, no exporter;
no `toCsv`, skip the first branch; no `export`, skip the second. The branch
that starts with `export` now gets the fast prefix scan too. We checked the new
function against the old regex on all 18,446 source files under `ventures/`:
no disagreements.

The other half was the file walk. Three scans ran eleven `rglob` calls over a
270,000-entry tree and read some files three times. One `os.walk` that prunes
`node_modules` and friends, and one read per file, replaced them.

Neither change needed another language. The full write-up, with the profile and
the ranked list of what's left, is in
`docs/history/ci-perf-2026-11-20-csv-guard-one-walk.md`; the earlier story of
the same lesson is [We almost rewrote it in Rust](/posts/2026-10-20-we-almost-rewrote-it-in-rust/).
