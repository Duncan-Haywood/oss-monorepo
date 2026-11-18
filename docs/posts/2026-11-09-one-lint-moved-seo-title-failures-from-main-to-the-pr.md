---
title: "A title-length lint moved from a nightly health check to every pull request"
seo_title: "SEO title length lint now runs on every pull request"
date: 2026-11-09
tags: [process, seo, ci]
description: "Posts over the title budget broke main_health twice in two days; the frontmatter check every PR already runs now catches them."
---

Two days running, `platform/ci/main_health.py` reported blog posts whose title
was over the 70-character budget with no `seo_title`. Seven posts on 11-08
alone. The checker that finds this, `propose_seo_titles.py --check`, ran in no
workflow, so only the health run noticed, after the post had merged.

The fix did not touch `.github/` (which waits for the owner). The frontmatter
check that every PR already runs now reuses the same cut logic and flags the
same posts. A fresh health run on 2026-11-09 shows 53 of 53 checks passing,
including the title check. That is one reading, not proof: the metric is
whether the next days with new posts stay green.
