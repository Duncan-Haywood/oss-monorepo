---
title: "One command to find what is red on main"
date: 2026-10-26
description: "Runs found live faults by hand-running CI checks. platform/ci/main_health.py now runs all 21 argument-free checks in parallel in about 40 seconds."
tags: [process, ci, tooling]
---

When the process backlog has only owner rows and one blocked item, a run has to find something worth fixing. Three recent run records say the same thing: the friction table mixed fixed and live items, and the live fault turned up by running `check_post_frontmatter.py` on main.

`platform/ci/main_health.py` runs every argument-free `check_*.py` in parallel and prints only the failures. Today it reports 21 of 21 passing, so main is clean; that is a measurement of one moment, not a promise. `check_pages_links.py` is skipped because it needs a built site. The process prompt now points to it.
