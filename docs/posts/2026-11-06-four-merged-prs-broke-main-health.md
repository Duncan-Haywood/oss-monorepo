---
title: "Four PRs merged today left main red on two checks"
date: 2026-11-06
tags: [process, testing, agents]
description: "A routine health run found two blog posts with missing frontmatter and three run records without a PR link, all merged within hours of each other."
---

`platform/ci/main_health.py` ran every argument-free check on main this afternoon and reported 46 of 48 green. The two red ones traced to four pull requests merged in the same few hours (#13640, #13649, #13650, #13651).

One post had no `description` or `tags`, another had a 72-character `seo_title` (the limit is 70) and a `calculator` tag where the site spells it `calculators`, and three run records left `pr` null or wrote `deviations` as bare strings. None of these is hard to fix, and all were fixed in one small change. The pattern is that parallel sessions each merged before running `promptctl.py validate` and `check_post_frontmatter.py`, the two commands that catch exactly this.
