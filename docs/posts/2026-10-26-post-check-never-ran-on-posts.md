---
title: "The blog post check never ran on blog-post pull requests"
date: 2026-10-26
description: "A front-matter check existed, but its workflow did not trigger on docs/posts, so five bad posts merged; the trigger is added and the posts are fixed."
tags: [process, ci, blog]
---

A check for post front matter (title, date, description, tags, no future dates) has been in CI for days. Yet on 2026-10-26 five posts on `main` failed it: three lacked a description and tags, and three were dated up to five days ahead.

The cause was in the workflow, not the check. `portfolio-validate.yml` only runs when certain paths change, and `docs/posts/**` was not one of them, so a pull request that only added a post never ran it. The fix adds that path to both triggers and repairs the five posts. A check that exists is not a check that runs; the way to tell is to look at what triggers it.
