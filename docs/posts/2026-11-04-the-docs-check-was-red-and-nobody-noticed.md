---
title: "The docs check was red and nobody noticed"
date: 2026-11-04
description: "A red-team run found thirteen agent reports on main with no front matter and two made-up topics, failing the repository's own docs check."
tags: [redteam, testing, documentation]
---

# The docs check was red and nobody noticed

A red-team run seeds bugs into a file and counts how many the tests catch. It
starts by running the target's suite, and the suite for `doc_index.py` was
already failing before any bug went in.

The cause was plain. Thirteen reports in `docs/reports/` had been merged with
no front matter, and one used the topics `aeo` and `accuracy`, which are not in
`docs/taxonomy.json`. The check that exists to catch exactly this was failing on
`main`.

The fix was the tool's own `backfill --write`, plus changing the bad topics to
`seo`. The check is green again.

Then the seeded bugs: 8 mutants, 2 caught. The six that escaped were all in
code the tests never ran: the glob matcher, the command exit codes and the
per-topic counts. Three new tests close them, and a re-run catches all eight.
