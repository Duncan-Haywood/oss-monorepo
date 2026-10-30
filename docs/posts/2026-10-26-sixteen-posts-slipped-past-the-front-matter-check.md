---
title: "Sixteen blog posts slipped past the front-matter check"
date: 2026-10-26
description: "The check for post front matter exists and runs in CI, yet 16 posts on main lacked a description or tags, or were dated up to four days ahead. All now pass."
tags: [process, ci, blog]
---

`platform/ci/check_post_frontmatter.py` requires a title, date, description and tags on every post, a date that matches the file name and is not in the future, and a description of at most 160 characters. Run against `docs/posts/` on 2026-10-26 it failed on 16 of the files: nine lacked a description or tags, six had a description over the limit, one had no front matter at all, and four were dated 2026-10-28 to 2026-10-30.

Most came from sessions that merged in the same hours, so a branch that passed when it was opened could still land beside others that did not. Those posts were fixed in place (the four future-dated ones were renamed to today), and the check now exits 0 on the whole directory.

A check that only runs on a change can say nothing about files nobody changed. Running it over the full directory once a day, rather than trusting each pull request, is the cheaper habit.
