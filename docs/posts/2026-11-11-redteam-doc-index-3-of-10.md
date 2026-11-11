---
title: "Our report index caught 3 of 10 seeded bugs, then 10 of 10"
seo_title: "Mutation testing a docs checker: 3 of 10 seeded faults caught"
date: 2026-11-11
tags: [testing, mutation-testing, ci, docs]
description: "We seeded 10 faults into doc_index.py, which tags agent reports. Its tests caught 3. New tests close the gaps, and the run fixed six real defects."
---

`platform/ci/doc_index.py` reads the front matter on every agent report in `docs/reports/` and checks it against a shared vocabulary in `docs/taxonomy.json`. Later sessions use it to find what earlier ones learned (`doc_index.py find shallow-clone`).

**The seeded faults.** A red-team run put 10 small faults into the file, one at a time, and ran its test suite against each. The tests failed on 3. They missed these 7:

- `tag_key` dropping the final "s" from three-letter tags ("dns" became "dn");
- a glob rule in `prompts/system.json` matching every path;
- the "agent note" title rule for brief reports going dead;
- two-word and three-word topic aliases ("merge base") never tagging a report;
- the CLI's `--help` text and its missing-subcommand error.

Seven small tests now fail on each of those faults. A rerun put all 10 back in and all 10 were caught.

**What was actually broken.** Reading the code turned up six real problems:

1. **The check was red on main with 73 problems.** Nine reports had no front matter, and three were tagged `aeo`, an alias of the `seo` topic. About 55 more tags came from polish-run reports and were not in the vocabulary at all: `tooling` 11 times, `accessibility` 8, `performance` 7, `design` 6, `lighthouse` 4. No pull-request workflow runs `doc_index.py check`, so nobody saw. Every report is fixed now. A separate control-plane PR wires the check into CI, and it needs the owner's approval.
2. **The vocabulary was missing the polish track's subjects.** It had no topic for design, accessibility or performance, though those tracks write most of the new reports. All three are now topics, and the near-misses (`lighthouse`, `layout-shift`, `contrast`, `heading-order`) are aliases of them.
3. **An alias failed the check with no tool to fix it.** `backfill --write` now swaps an alias for its id, and the error message says so.
4. **A report named `2026-11-06-polish-…` was tagged as an analysis.** The `polish-` prefix was only recognised when it came before the date.
5. **`process-2026-11-11-….md` got no date.** A date after a track prefix was never read.
6. **`backfill --write` could delete data.** When a report had front matter but no `kind`, any field the tool didn't know about was dropped when the file was rewritten.

The CRLF case looked like a fifth bug: front matter with Windows line endings might be read as missing and written twice. It isn't. Python's text mode turns `\r\n` into `\n` before the parser sees it. A test now guards that behaviour.

A catch rate of 30% means a change to this file had a 70% chance of breaking it without any test noticing. The file is small, and many runs depend on it to find earlier work.
