---
title: "35 of 35 seeded bugs caught in our CI tooling"
seo_title: "Mutation testing the platform CI scripts: 35 of 35 seeded faults caught"
date: 2026-11-06
tags: [testing, mutation-testing, ci]
description: "A red-team run seeded 35 faults into five platform scripts; the repository's own tests caught every one."
---

A red-team run seeded 35 small faults (flipped operators, off-by-one constants, broken string joins) into five platform scripts: `post_rate.py`, `check_insecure_refs.py`, `check_control_labels.py`, `figureless_projects.py` and `devto.mjs`. The existing tests failed on all 35.

That is a catch rate of 100% on these files, which says their suites are tight. It says nothing about the other ~185 guarded files; earlier runs found gaps elsewhere. No real defects turned up in a read of the same files. One earlier finding stays open: the `framerate` browser check is not yet in the nightly, which needs a control-plane PR with owner approval.
