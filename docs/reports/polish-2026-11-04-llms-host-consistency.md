---
kind: polish
topics: [llms-txt]
date: 2026-11-04
tagged: auto
---
# Polish run 2026-11-04: llms.txt host consistency

Six `llms.txt` files (ai-bookkeeper, einvoice-preflight, league-schedule-generator, open-tennis-robots, photo-editing, quick-pick-survey) linked to the older `github.io/monorepo-projects/` address while the other 1,307 use `github.io/oss-monorepo/`. Rewrote them to the common address. `check_llms_txt_links.py`: 0 dead links across 1,330 files. `missing_llms_txt.py`: none missing.
Not done: site build and screenshots. Next: a check that fails on any host other than the canonical one in `llms.txt` (not built).
