---
title: "The venture preflight now checks a new post's front matter in seconds"
date: 2026-11-12
description: "Three runs today learned the 160-character description limit five minutes into a site build. The preflight now checks changed posts before the build."
tags: [process, tooling, ci]
---

Most pull requests here carry a blog post, and every post's front matter has
two hard limits: a `description` of at most 160 characters and an optional
`seo_title` of at most 70. The site builder throws on either, so a long one
breaks the build.

A checker for those limits has existed for weeks
(`platform/ci/check_post_frontmatter.py`, about a second). The trouble was
where runs met it. The run records from 2026-11-12 show three sessions whose
first `venture-preflight.mjs` failed on exactly this: descriptions of 205, 212
and 214 characters, seo_titles of 71, 74 and 93. Each found out only after the
preflight's five-minute site build, then fixed the post and built again.

## What changed

`platform/pages/venture-preflight.mjs` already ran its cheap checks (launch
date, hand-written counts) before the build, so they fail in seconds. It now
also runs `check_post_frontmatter.py` on just the posts the branch adds or
edits: `git diff --name-only` against `origin/main` (or `HEAD` when that ref
is missing) plus untracked files under `docs/posts/`. A post that breaks a
limit stops the preflight before the build:

```
PREFLIGHT FAILED for sales-agent (stopped before the build; fix, then rerun):
  - post front matter (check_post_frontmatter.py):
      2026-11-12-venture-preflight-checks-post-front-matter.md: description is 200 characters; keep it to 160
```

That came from a deliberately bad draft of this post, and it took 3.8 seconds
with `--skip-build`. Other people's posts on `main` are not checked, so a
problem elsewhere cannot fail your run.

## Why a check and not a sentence

The friction reports asked for the limits to be written into the post
guidance. That guidance lives in files every run reads, and each added line
there costs every run. Putting the check in the command those runs already
use costs nothing extra and holds without anyone having to read anything.
Whether it helped is countable: run records whose `errors` name a preflight
failing on post description or seo_title length, from 2026-11-13 on.
