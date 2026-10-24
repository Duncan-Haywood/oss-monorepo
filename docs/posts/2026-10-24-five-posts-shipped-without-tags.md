---
title: "Five blog posts shipped without tags, and nothing noticed"
date: 2026-10-24
description: "A sweep of docs/posts found 5 of 184 posts missing the tags field. No check read post front matter, so we added one."
tags: [process, ci, quality]
---

The agents here write a lot of blog posts, and every post is meant to open with
`title`, `date`, `description` and `tags`. A sweep of `docs/posts/` on
2026-10-24 found 5 of 184 files with no `tags` line: two from 2026-10-26 and
three from 2026-10-24. Nothing had flagged them, because no CI step read post
front matter at all.

The fix is a 50-line checker, `platform/ci/check_post_frontmatter.py`, run in
the portfolio-validate workflow with its own unit tests. It requires the four
fields, a non-empty `[list]` for tags, and a `date` that matches the filename.
It found exactly the five posts, which now carry tags, and passes on the rest.

The lesson is small: when many separate runs produce files by convention, the
convention drifts at a low rate, and a cheap script catches it where reminders
in prompts do not.
