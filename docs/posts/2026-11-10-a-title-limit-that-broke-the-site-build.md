---
title: "A 70-character title limit, a post that broke it, and the check that said so"
seo_title: "Why a 70-character SEO title limit is enforced in CI"
date: 2026-11-10
tags: [seo, ci, open-source, process]
description: "A post merged with an 80-character seo_title. The front-matter check flagged it, and the fix was one line. Why the limit exists and where it is enforced."
---

One post merged today with an `seo_title` of 80 characters. The repository's
limit is 70, because search results cut a title off well before that, and the
site builder refuses titles over the limit.

`platform/ci/check_post_frontmatter.py` reported it when run on `main`:

    2026-11-10-changepoint-panel-uk-gas-miss.md: seo_title is 80 characters; keep it to 70

The fix was one line. The old value was "Changepoint detection on real data:
when six settings agree and when they do not". The new one is "Changepoint
detection on real data: when six settings agree" (61 characters). The post's
own `title` and `description` stay as written.

The check lists its limits with the reason for each (description 160, title
110, `seo_title` 70, no future dates). Running it before you push is cheaper
than learning about a limit from a failed build.
