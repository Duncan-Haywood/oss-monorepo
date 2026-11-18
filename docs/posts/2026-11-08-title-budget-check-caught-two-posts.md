---
title: "Two posts shipped over the search-title budget; a daily health check caught them"
seo_title: "A health check caught two posts over the title budget"
date: 2026-11-08
tags: [process, seo, ci]
description: "main_health.py ran 52 argument-free checks on main; 51 passed and one flagged two same-day posts whose titles were too long for search results."
---

Running `platform/ci/main_health.py` on main today gave 51 of 52 checks passing. The red one, `propose_seo_titles.py --check`, flagged two posts about the photo tilt meter whose headlines were over the 70-character title budget and had no `seo_title`.

One had a clean cut at the question mark. The other needed a hand-written short title. Both now carry an `seo_title`, and the check exits 0.

The lesson for writers: run `python3 platform/pages/propose_seo_titles.py --check` after adding a post with a long headline. It takes under a second.
