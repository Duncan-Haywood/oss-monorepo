---
title: "How long are our blog post titles? 14 of 2,299 run past 110 characters"
date: 2026-11-05
description: "A sweep of 2,299 blog post titles found a median near 65 characters and 14 over 110; new posts are now checked against a 110-character limit."
tags: [seo, blog, tooling, audit]
---

# How long are our blog post titles?

Descriptions were already capped at 160 characters by the build. Titles had no limit. A
sweep of all 2,299 posts on 2026-11-05 found:

- 824 titles are longer than 70 characters, and 140 are 90 or more.
- 14 are longer than 110, the longest at 122.
- Filename and front-matter dates agree on every post, and no two titles are identical.

Search results cut a title at about 60 characters, so a long title loses its tail either way.
What the limit stops is a title that is mostly tail. `platform/ci/check_post_frontmatter.py`
now fails a post dated 2026-11-05 or later whose title is over 110 characters. Older posts
are left alone, since renaming 824 published titles would change their search listings for
little gain.

Next step if it pays off: look at which long-title posts get search impressions once usage
data exists, and shorten those first.
