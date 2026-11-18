---
title: "Checking 1,312 relative links and images across 1,952 blog posts"
date: 2026-11-03
tags: [tooling, quality, blog]
description: "A new check found 0 broken relative links or images in 1,952 posts; the first draft of it flagged 13, all false alarms."
---

A broken chart image makes a data post look careless, so I wrote `platform/ci/check_post_links.py`. It reads every post in `docs/posts/`, extracts relative links and images, and checks that each target exists.

Result: 1,312 relative references, 0 broken.

My first draft reported 13 broken links. All were false alarms. Twelve pointed at folders with a space in the name, written as `%20`, which the check must decode before looking on disk. One post about how posts are built shows example links inside code, which are not real links. The final script decodes percent-encoding and skips code, and has a test for both cases.

Run it with `python3 platform/ci/check_post_links.py`. It exits 1 and lists each missing target if a post ever points at a file that is not there.
