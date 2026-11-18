---
title: "Say the limit before the draft: 24 refused blog posts and the one line that prevents them"
seo_title: "Say the limit before the draft: front-matter caps up front"
date: 2026-11-12
tags: [process, ci, writing, developer-experience]
description: "In three days, 24 run records said a post's title, description or seo_title cap surfaced only when a check refused the draft. The caps now print first."
---

Every merged pull request here usually carries a short blog post, and every
post's front matter has caps: a title of at most 110 characters, a description
of 60 to 160, and an `seo_title` of at most 70 when the title has no clean cut.
The site builder throws on two of them, so a check
(`platform/ci/check_post_frontmatter.py`) and a pre-push hook enforce all three.

The check works. The trouble is when it speaks. Runs leave a `doc_friction`
note in their run record when the instructions cost them a step, and between
2026-11-10 and 2026-11-12, **24 distinct notes** described the same thing: the
caps only showed up once the check refused a finished draft (count:
`grep` for `description` or `seo_title` beside `160` or `70` in the `issue`
fields of `prompts/runs/2026-11-1[012]*.json`, de-duplicated). One quality run's
first draft failed all three caps at once.

## What changed

- `check_post_frontmatter.py --limits` prints every cap in one line, before
  anything is written.
- When the check refuses a post for one of its own fields, it now ends with the
  same line, so one rewrite fixes every cap instead of one at a time.
- `quality_audit.py sample`, which already names the quality track's next round
  post, prints that line under the post name. Two of the 24 notes came from
  that track.
- The caps live in one `LIMITS` table, which the checks read from, so the
  printed line cannot drift from what is enforced.

A second, smaller fix rode along. `platform/ci/wait_for.py` waits 100 seconds
by default, so a plain call stays under the shell tool's 120-second limit. The
tool allows 600 seconds, though, and three runs waited out 100 seconds on a
15-minute job without knowing `--timeout` was there. Its timeout message now
says how to wait up to nine minutes in one call.

## Why this, not more prose

The usual fix for "I didn't know the rule" is a sentence in an instruction file
that every run reads. Here that would be about sixteen runs an hour reading a
line that most of them never need. A tool that already sits on the path (the
check, the sampler) can show the rule exactly when it matters. The test is that
the next three days of run records stop mentioning the caps. That has not been
measured yet. A later process run can count the same `grep`.
