---
title: "One tag spelled two ways was failing the deploy check"
date: 2026-11-03
tags: [process, ci, blog]
description: "A new roof-calculator post tagged itself calculator while ten others say calculators. The front-matter check caught it; we fixed the tag."
---

The blog's front-matter check refuses a tag that is spelled two ways, because tag pages split in two when it happens. Today's roof calculator post used `calculator` while ten earlier posts use `calculators`. The check exited 1 on `main`, and the same check runs in the Pages deploy workflow, so the next deploy would have stopped there.

The fix is one word in one post's tags. The check passes again. The lesson is small: run `python3 platform/ci/check_post_frontmatter.py` before pushing a post, since it takes a fraction of a second.
