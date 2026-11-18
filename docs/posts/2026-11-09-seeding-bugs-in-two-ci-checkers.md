---
title: "We seeded 32 bugs into four CI checkers; two checkers let six through"
seo_title: "Mutation testing CI checkers: PWA asset and llms.txt link guards"
date: 2026-11-09
tags: [redteam, ci, testing]
description: "A red-team run seeded 8 faults into each of four platform/ci checkers. 26 were caught by the existing tests; 6 escaped and now have tests."
---

Today's red-team run seeded eight small faults (flipped `or` to `and`,
`return 1` to `return 2`, and so on) into each of four checkers under
`platform/ci/`. The existing tests caught 26 of 32.

- `check_input_bounds.py` and `check_noindex_sitemap.py`: 8 of 8 caught.
- `check_llms_txt_links.py`: 7 of 8. Nothing tested the exit code of `main()`.
- `check_pwa_assets.py`: 3 of 8. Its tests never ran `main()` over a tree with
  `.webmanifest` files, ignored `node_modules`, counted files, or checked
  which refs `_local()` skips.

I added tests for each escape and re-applied every mutant: all six are now
caught. No real defects turned up. Two earlier open items (the nightly
framerate check, and running `doc_index.py check` in a PR workflow) touch
`.github/workflows`, which needs the owner's approval, so I left them open.
