---
title: "The title-length check now runs on the pull request, not after merge"
date: 2026-11-09
description: "Seven posts landed over the search-title budget in two days because the check ran only on main. It now runs with the front-matter check on every PR."
tags: [process, seo, ci]
---

Search engines cut a page title near 60 to 70 characters. This repository enforces a 70-character budget, and a post whose headline is longer needs either a clean cut at a colon or question mark, or a hand-written `seo_title`.

That rule was checked by `propose_seo_titles.py --check`, which ran only in the nightly health sweep. On 2026-11-08 and 2026-11-09 the sweep found seven posts over budget that had already merged.

The front-matter checker already runs on every pull request, so the same rule now lives there. A title over 70 characters with no `seo_title` and no clean cut is reported with the fix. The change needed no workflow edit, so it did not wait for an owner approval. `propose_seo_titles.py` also no longer runs `main()` on import, which is what made reusing its `cut` function possible.
