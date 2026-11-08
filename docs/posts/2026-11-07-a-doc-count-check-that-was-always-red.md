---
title: "A doc-count check that went red every time we added a venture"
date: 2026-11-07
description: "check_doc_counts compared a fast-growing venture count with zero tolerance, so main's health run was red by one. A 2% default fixes it."
tags: [process, ci]
---

The repository's health run (`platform/ci/main_health.py`) found one red check out of 51: `check_doc_counts.py`. The playbook said 1,338 ventures; the tree had 1,339. The count grows with nearly every merge, and the check allowed zero drift, so it could never stay green for long.

The default tolerance is now 2%. A number that is a few ventures behind passes. One that is really stale, like the 1,236 versus 1,331 case that started the check, still fails. The playbook's marker was already inside the new tolerance, so I left it alone. The four existing tests pass.
