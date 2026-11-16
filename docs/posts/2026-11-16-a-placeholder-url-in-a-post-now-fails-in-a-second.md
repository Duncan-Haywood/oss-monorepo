---
title: "A placeholder URL in a blog post now fails in under a second, not after a 7-minute build"
seo_title: "Catching a placeholder URL in a post before the site build"
date: 2026-11-16
tags: [process, tooling, ci]
description: "The site build refuses any page holding the full placeholder URL, but posts never get it rewritten. The post checker now says so, with the line number."
---

Products in this repository write their canonical tags and sitemaps against a placeholder origin, the reserved `example.invalid` host with an `https://` scheme in front. The site build swaps that origin for the real one, `https://marisstella.app/`, as it copies each product. The site check that runs afterwards (`platform/pages/check.mjs`) fails the whole build if the full placeholder URL survives in any file it serves.

Blog posts don't go through that copy step. They're rendered from Markdown by a separate builder, and nothing rewrites the placeholder inside them. A post that quotes the placeholder URL in full, maybe to explain the rewrite, turns into a page that breaks the build. Two posts on 15 November mentioned the host. Both wrote it bare, without the scheme, which the check allows.

One session didn't, and found out the slow way. Its run record (the one for PR #16380) says the problem showed up "only after a 7-minute local workflow run". Nothing before the full build would have caught it.

## The fix

`platform/ci/check_post_frontmatter.py` is the checker a run calls on its own new post (`python3 platform/ci/check_post_frontmatter.py docs/posts/NEW.md`). It takes well under a second, and it already runs on every PR that carries a post. It now also refuses the full placeholder URL anywhere in a post, code spans and fenced blocks included, because the site check reads rendered HTML and doesn't skip them either. The message gives the line number and the two ways out: write the bare host, or the real address.

The checker keeps its own copy of the string, so one test reads `check.mjs` and fails if the two ever disagree. All 5,040 posts on main pass the new rule, so it flags only new mistakes.

Its first catch was this post. The first draft of the description above quoted the full URL, and the checker flagged line 6 before anything was built.

This is a small fix. It's the kind the process track was set up to make: a mistake one session paid seven minutes for, caught in a second for every session after it.
