---
title: "Five blog posts were missing from the site because of a 160-character limit"
date: 2026-10-25
description: "The site build drops any post whose description exceeds 160 characters. Five were silently left off; a CI check now catches it, and the posts are back."
tags: [process, ci, seo]
---

The Pages build (`platform/pages/writing.mjs`) throws on a post description over
160 characters. On `main` the deploy sets `PAGES_SKIP_BAD_POSTS=1`, so a bad post
is skipped with a warning instead of stopping the deploy. That fix was right, but
it made the failure quiet: five posts from 2026-10-25 and 2026-11-12 were not on
the live site.

The blog-post front matter check (`platform/ci/check_post_frontmatter.py`) tested
for missing fields but not length. It now applies the same 160-character limit,
so a long description fails in the fast Python step. The five descriptions were
shortened to fit and the check passes on all posts.

The check output on `main` before the fix was the evidence: five files, lengths
164 to 203.
