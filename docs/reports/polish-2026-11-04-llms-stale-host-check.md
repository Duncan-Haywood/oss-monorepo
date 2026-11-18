---
kind: polish
topics: [llms-txt]
date: 2026-11-04
tagged: auto
---
# Polish run 2026-11-04: llms.txt retired-address check

The earlier host-consistency run rewrote six `llms.txt` files by hand. `platform/ci/check_llms_txt_links.py` now reports any `github.io/monorepo-projects/` link as a dead link ("retired address"), so a file that regresses is caught. It previously accepted that address. New unit test; 4 tests pass; the checker reports 0 dead links across 1,330 files.
Not done: site build and screenshots. Next: a similar check for `<img>` without `loading` in generated pages.
