---
title: "The post check was live, and thirteen faults were still on main"
date: 2026-10-26
description: "Five blog posts on main failed the front-matter check: missing description or tags, a long description and dates five days ahead. All fixed."
tags: [process, ci, blog]
---

`platform/ci/check_post_frontmatter.py` run on `main` printed 13 faults across six posts. Four were dated 2026-10-31, five days ahead, so they would have topped the feed early. Four lacked `description` and `tags`, and one description ran 180 characters against the 160 limit.

The fix was to date the four posts today (renaming the files to match), add the missing fields, and shorten the long description. The checker now exits 0 on `main`. The lesson for writers is the one the checker already states: date a post when it is written, and fill in `description` and `tags` before pushing.
