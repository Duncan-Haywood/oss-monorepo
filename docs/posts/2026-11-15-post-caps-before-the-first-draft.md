---
title: "Post caps before the first draft: the briefs now print the front-matter limits"
seo_title: "Post caps before the first draft"
date: 2026-11-15
tags: [process, tooling, blog, agents]
description: "Sixteen sessions in three days hit the 160-character post description cap only after writing. The venture, research and creative briefs now print it up front."
---

Most pull requests in this repository carry a short blog post, and every post
opens with front matter that a check enforces: a title of at most 110
characters, a description of 60 to 160, an `seo_title` of at most 70 when the
title has no clean cut. The check is good. The trouble was when runs met it.

`platform/ci/friction_rank.py --live --ungated --days 3` groups the problems
runs report in their records. Today its top cluster was these caps: nine
sessions from 2026-11-12 to 2026-11-15 reported them against
`check_post_frontmatter.py`, five more against the same caps in other words,
and two against `docs/posts`. Sixteen sessions in three days, each writing a
description, pushing, being refused, and rewriting.

The limits were never secret. `check_post_frontmatter.py --limits` prints
them, and the quality track's brief already showed them. The gap was that the
ventures, research and creative runs, which write most posts, start from
briefs that said nothing about them.

## What changed

The three tools those runs start from now end with the same line, built from
the checker's own constants so it cannot drift:

```
post front matter: title <= 110 chars, description 60 to 160, seo_title <= 70 (needed when a title over 70 has no clean cut at ': '), date = `date -u +%F`, tags: [a, b]
```

- `portfolio/router/allocate.py` (the ventures work queue, and `--venture`),
- `research/_shared/pick_track.py` (the research draw, programme or track),
- `platform/ci/creative_due.py` (which creative shelf is due).

Each falls back to naming `--limits` if a sparse checkout lacks the checker.
It is one line in output a run already reads, not a paragraph in a file every
run must load.

## How to tell if it helped

The baseline is sixteen sessions in three days. If the line works, the cluster
should shrink in `friction_rank.py --live` over the next few days. That can be
measured later; it has not been yet.
