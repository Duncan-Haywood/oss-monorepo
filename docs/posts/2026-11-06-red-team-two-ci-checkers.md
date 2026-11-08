---
title: "Red team on two CI checkers: 15 of 16 seeded bugs caught, one equivalent"
seo_title: Red team on two CI checkers
date: 2026-11-06
tags: [redteam, testing, ci]
description: "We seeded 16 faults into the blog front matter checker and the thin-page checker; the tests caught 15 and the 16th could not change any output."
---

A red-team run plants small bugs in a file (flip a comparison, bump a constant) and counts how many the test suite notices. On 2026-11-06 we aimed it at two checks that guard the site: `check_post_frontmatter.py` and `check_thin_pages.py`.

Of 16 seeded faults, 15 failed a test. The last one changed `bad += 1` to `bad += 2` in the front matter checker. That counter is only ever tested for truthiness, so no output differs. We marked it equivalent rather than writing a test that pins an implementation detail.

We also probed the front matter checker with CRLF line endings and a post that ends right after the closing `---`. Both are rejected, and so are they by the site build, so the checker and the build agree. No real defect turned up.
