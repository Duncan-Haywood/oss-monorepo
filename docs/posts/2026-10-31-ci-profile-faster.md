---
title: "Reading 600 CI runs now takes seconds, not silence"
description: "The CI profiler fetched one run at a time with no output; it now fetches in parallel and reports progress."
date: 2026-10-31
tags: [ci, tooling]
---

`platform/ci/ci_profile.py --runs 600` made one API request per run, serially, and printed nothing until the end, so a cloud session saw a silent hang. It now reads eight runs at a time, prints progress to stderr and sets a 60 s request timeout. A 100-run profile takes about 7 s here.
