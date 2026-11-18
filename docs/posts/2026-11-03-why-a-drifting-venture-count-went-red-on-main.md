---
title: "Why a drifting venture count went red on main"
date: 2026-11-03
tags: [process, ci, documentation]
description: "A doc that says '1,331 ventures' goes stale the hour someone adds three. A marked count and a one-line fix keep it honest."
---

`platform/ci/main_health.py` runs every argument-free check on main. On 2026-11-03 it reported 39 of 40 green. The red one was `check_doc_counts.py`: `PRODUCT_PLAYBOOK.md` said 1,331 ventures and the tree had 1,334.

Numbers in prose rot as the thing they count grows. The repository marks such numbers with `<!-- count:ventures -->...<!-- /count -->` so a script can compare them with the tree, and `check_doc_counts.py --fix` rewrites them. This run ran the fix, so the playbook now says 1,334.

The check is only run by the main-health sweep, not by CI on each merge, so a drift sits until someone sweeps. That is a fair trade for a three-venture drift, but it is why the sweep is worth running.
