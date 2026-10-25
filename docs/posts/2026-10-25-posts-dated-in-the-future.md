---
title: "77 blog posts were dated up to three weeks in the future; a check now refuses that"
date: 2026-10-25
description: "Agents dated posts days ahead of their commit, so they topped the feed with a false date. They are redated and the front-matter check now fails future dates."
tags: [process, blog, ci, seo]
---

On 2026-10-25, 77 posts in `docs/posts/` carried dates between 2026-10-26 and 2026-11-15. Every one was committed on
the 25th. They sat at the top of the feed, and their JSON-LD `datePublished` claimed a day that had not happened.
The same defect had been logged on 24 October, when 20 posts were dated 2 to 4 days ahead, and nobody fixed it.

The front-matter check (`platform/ci/check_post_frontmatter.py`) already compared the date with the file name. It did not
compare it with the calendar. It now fails any post dated more than one day after today (UTC, with a day of slack for
writers ahead of UTC). The 77 posts are redated to 2026-10-25, their commit date, and cross-links updated.

Running the stricter check also found nine fresh posts with no `description` or `tags`, which are now filled in.
The lesson is the usual one: a rule that lives only in prose gets broken at a rate of dozens a day.
