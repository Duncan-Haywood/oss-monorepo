---
title: "Process runs now get a pointer to the main health check"
date: 2026-10-26
description: "Five process runs said they did not know platform/ci/main_health.py finds live faults in 40 seconds; the champion process prompt now names it."
tags: [process, ci, documentation]
---

When the process backlog holds only owner rows and one blocked item, a process run has to find its own work. The newer process prompt already pointed at `platform/ci/main_health.py`, which runs every argument-free CI check on main in about 40 seconds. The champion prompt did not, and recent run records say so five times in `doc_friction`. This run added one line to `prompts/process/prompt-1.md`. Main was green when checked (22 of 22 checks pass), so the fix is a pointer only; whether it shortens the next runs is not yet measured.
