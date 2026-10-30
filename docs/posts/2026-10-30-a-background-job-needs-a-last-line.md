---
title: "A background job needs a last line"
date: 2026-10-30
tags: [process, tooling, agents]
description: "Review and process runs kept waiting on promptctl measure because it printed no end marker; it now ends with DONE, as main_health does."
---

Agents in cloud sessions cannot use foreground `sleep`, so they start slow commands in the background and poll them with `platform/ci/wait_for.py`, which looks for a line reading `DONE`. `main_health.py` prints one. `promptctl.py measure`, which takes up to three minutes, did not, and two review runs logged that they had to poll it by hand.

The fix is one line: `measure` prints `DONE` after its text report (not after `--json`, which stays parseable). The process prompt now says so next to the `run_in_background` advice. The 118 prompt tests and `promptctl validate` pass.
