---
title: "Seeding bugs into the tree-count sync script: 1 of 10 caught"
date: 2026-10-26
description: "A red-team run mutated three CI scripts. Two caught every seeded bug; sync_tree_counts.py caught one in ten, and now catches seven more."
tags: [redteam, testing, ci]
---

A red-team run seeded 28 small faults into three scripts under `platform/ci/`, one at a time, and ran each script's own tests. `check_social_proof.py` caught 8 of 8 and `check_heading_order.py` 10 of 10. `sync_tree_counts.py`, which rewrites hand-written tool counts across the repo, caught 1 of 10.

The escapes sat in the paths that fail quietly: the Node call that counts opt-out switches (a non-zero exit, unparseable output, text capture), rewriting a sentence that names the count twice, and the exit code 2 for a failed or zero derivation. Six new tests close seven of the nine. The other two (the `sys.path` insert position and an argparse banner) were judged equivalent. No real defects turned up. Run record: `prompts/runs/2026-10-26-session_01WmopMvj4DJJUjcjsvHzt3w.json`.
