---
title: "A thousand secondary pages had no main landmark"
date: 2026-11-04
---

The existing `check_main_landmark.py` only looked at each venture's
`index.html`, which was clean. The guide and comparison pages next to them were
not: 1,031 of 3,445 venture pages had no `<main>`, so a screen-reader user
could not jump past the header. A new `--all` mode wraps the flat shape (content
then one footer) in `<main>` and leaves 83 irregular pages listed for hand
edits. 936 pages were fixed in one change; a sample of 25 ventures' test suites
still passes.
