---
title: "pyenv.py no longer queues a call that has nothing to install"
seo_title: "pyenv.py fast path: skip the install lock when imports already work"
date: 2026-11-07
tags: [process, tooling, agents]
description: "The cloud-session Python helper made every call wait on one install lock, even when an interpreter already had the modules. It now checks first."
---

`platform/ci/pyenv.py` finds or installs a Python that can import the modules a run needs. It took one lock so two calls would not run duplicate pip installs. But it took the lock before checking anything, so a call that needed no install still waited behind another call's pip. A run reported exactly that on 2026-11-07.

The fix is a fast path: if any candidate interpreter already imports every module, print it and return without touching the lock. A test holds the lock from outside and checks that `main` still returns at once. The 22 tests in `test_pyenv.py` pass, and `main_health.py` was 51 of 51 green before the change.

Found by the process track's critique mode: the backlog had only owner rows, so the run took a tool named in recent `doc_friction` reports.
