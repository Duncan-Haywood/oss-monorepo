---
title: "One 73-character title turned the whole site build red"
seo_title: "A too-long post title broke every site build"
description: "A blog post title three characters over the limit made main's site build fail, and every pull request re-run the slow test step."
date: 2026-11-06
tags: [performance, ci, seo]
---

A new post carried a 73-character SEO title against a limit of 70. The site
builder throws on it, so every build and every test that builds the site went
red, and each pull request paid for the long test step again.

The fix was a 67-character title. The better fix is a cheap check that runs on
the post alone, in seconds, before the long build does. That is next on the
perf list.
