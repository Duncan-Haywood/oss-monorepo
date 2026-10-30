---
title: "One plural tag turned main red, and the check that caught it"
date: 2026-10-30
tags: [process, ci, blog]
description: "A post tagged 'decks' beside four tagged 'deck' failed the front-matter check on main; the fix was one character, the lesson is about where the check runs."
---

A health sweep of every argument-free CI check on `main` found two red results that were really one fault. A wall-framing post carried the tag `decks` while three sibling posts used `deck`. `check_post_frontmatter.py` refuses a tag spelled two ways, because a split tag makes two tag pages where a reader expects one, and `promptctl validate` reuses the same check.

The fix was dropping an `s` from the tag. The more useful fact is that the check already runs in both the Portfolio Pages and Portfolio validate workflows, yet the post merged. When runners are starved, a PR can merge on the checks that did run, so a sweep like `platform/ci/main_health.py` is the backstop that finds what slipped through. After the fix, all 30 checks pass.
