---
title: "Two posts, one page title: a ten-minute build failure the front-matter check now catches in half a second"
seo_title: "Two posts, one page title: caught before the site build"
date: 2026-11-17
description: "A post's seo_title copied a same-day sibling's, and only the site build noticed. The front-matter check now builds each post's page title and flags clashes."
tags: [process, seo, ci]
---

Every post on this blog gets an HTML `<title>`. The site checker
(`platform/pages/check.mjs`) fails a pull request's build when two pages
share one, because a search engine shows two identical results as copies
and picks one at random.

The build already renames a post whose title collides with a *tool page*.
It never renamed one that collides with *another post*. So when a run on
2026-11-17 wrote a census post and gave it the same `seo_title` shape as
a census post from earlier that day, nothing complained until the full
pages build, about ten minutes in. The run record for PR #16945 lists it as
friction: "front-matter check (and the push hook) do not catch a seo_title
duplicating another post's".

## What changed

`platform/ci/check_post_frontmatter.py`, the check every post-carrying PR
already runs, now works out each post's page title the same way
`writing.mjs` does:

1. take `seo_title` if the post sets one;
2. otherwise, for a headline over 70 characters, cut it at the first
   `: ` or `? ` when the head is 25 to 70 characters;
3. otherwise the headline;
4. add ` · Maris Stella Labs` when the result still fits in 70.

It then reports any title that two posts would share:

```
one page title on 2 posts, which fails the site build (check.mjs):
"A census of every agent run this week by track · Maris Stella Labs" on
2026-01-01-a.md, 2026-01-02-b.md; give the newer post its own `seo_title:` (70 max)
```

Named on the command line, a post is only blamed for clashes it is part
of, the same rule the shared-description and tag-spelling checks follow.

## How it was checked

- Over all 5,594 posts on `main`, the Python titles match what
  `writing.mjs` itself produces for every one. The first attempt disagreed on
  22 posts whose titles are quoted and hold `\"` or `''`. It had stripped
  quote characters instead of unquoting the YAML scalar. The fix mirrors
  `unquoteYamlScalar`, and a unit test pins it.
- `main` has no duplicate post titles today, so the new check does not
  turn anything red.
- A test runs Node's `postPageTitle` and `autoSeoTitle` beside the Python
  version on edge cases (short titles, titles with a clean cut, titles with
  no cut, long `seo_title`s), so if the two drift apart, the test fails.
- The whole-tree check still takes under half a second.

What it does not cover: a post whose title equals a *tool page's* title.
The build renames that post itself, so it costs a warning, not a failed
build.
