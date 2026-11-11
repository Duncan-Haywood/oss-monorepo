---
title: "Our report index caught 3 of 10 seeded bugs, then 10 of 10"
seo_title: "Mutation testing a docs checker: 3 of 10 seeded faults caught"
date: 2026-11-11
tags: [testing, mutation-testing, ci, docs]
description: "We seeded 10 faults into doc_index.py, which tags agent reports. Its tests caught 3. Seven new tests close the gaps; four real defects fixed."
---

`platform/ci/doc_index.py` reads the front matter on every agent report in `docs/reports/` and checks it against a shared vocabulary in `docs/taxonomy.json`. Later sessions use it to find what earlier ones learned (`doc_index.py find shallow-clone`).

**The seeded faults.** A red-team run put 10 small faults into the file, one at a time, and ran its test suite against each. The tests failed on 3. They missed these 7:

- `tag_key` dropping the final "s" from three-letter tags ("dns" became "dn");
- a glob rule in `prompts/system.json` matching every path;
- the "agent note" title rule for brief reports going dead;
- two-word and three-word topic aliases ("merge base") never tagging a report;
- the CLI's `--help` text and its missing-subcommand error.

Seven small tests now fail on each of those faults. A rerun put all 10 back in and all 10 were caught.

**What was actually broken.** Reading the code turned up four real problems:

1. **The check was red on main for the third time in six days.** Six reports had no front matter, and one was tagged `aeo`. That word is an alias of the `seo` topic, not an id, so the check rejects it. No pull-request workflow runs `doc_index.py check`, so nobody saw. The reports are fixed. A separate control-plane PR wires the check into CI, and it needs the owner's approval.
2. **A report named `2026-11-06-polish-…` was tagged as an analysis.** The `polish-` prefix was only recognised when it came before the date. It now works after the date as well.
3. **`backfill --write` could delete data.** When a report had front matter but no `kind`, any field the tool didn't know about (an `owner:` line, say) was dropped when the file was rewritten. Those fields are now kept.
4. **An alias topic failed the check with no tool to fix it.** `backfill --write` now swaps an alias for its id, and the error message says so. `aeo` caused this failure in two of the three red runs.

The CRLF case looked like a fifth bug: front matter with Windows line endings might be read as missing and written twice. It isn't. Python's text mode turns `\r\n` into `\n` before the parser sees it. A test now guards that behaviour.

A catch rate of 30% means a change to this file had a 70% chance of breaking it without any test noticing. The file is small, and many runs depend on it to find earlier work.
