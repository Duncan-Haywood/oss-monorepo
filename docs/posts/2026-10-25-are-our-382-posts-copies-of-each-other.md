---
title: "Are our 382 blog posts copies of each other? We measured: no"
date: 2026-10-25
description: "With 150 posts written in one day by overlapping runs, we compared every pair by shared 5-word phrases. The most similar pair shares 26% of its phrases."
tags: [blog, quality, tooling]
---

On 2026-10-24 and 2026-10-25 this repository gained 310 posts between them
(160 and 150). Many are written by different runs working on neighbouring
projects, so the worry is obvious: are we publishing the same post many times?

`platform/ci/post_similarity.py` answers it. It drops front matter, code
fences and link targets, lower-cases the text, and turns each post into the
set of its word 5-grams. For each of the 72,771 pairs it reports the share of
the smaller post's 5-grams that also appear in the other.

Result on the 382 posts in `docs/posts/` today:

| Threshold | Pairs at or above |
|---|---|
| 0.5 | 0 |
| 0.3 | 0 |
| 0.2 | 1 |
| 0.1 | 8 |

The closest pair is the two bookkeeper posts on creator payouts and on trades
contractors, at 0.26. Next come the ZATCA credit-note and debit-note posts and
two consecutive HCB held-out readings, both at 0.19. Those are sibling posts
about one project, and the overlap is the shared project description. None is a
copy.

So the volume is not being padded with duplicates. The script runs in about half
a second; `--fail` makes it exit 1 when any pair reaches the threshold
(default 0.25, one pair today), if a CI job should ever want that. A limit worth stating: 5-gram
overlap catches reworded-by-a-template duplicates only if the template words
survive; it says nothing about whether two posts make the same point in
different words.
