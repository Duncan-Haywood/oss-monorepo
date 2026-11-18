---
title: "Six million substring searches to find which research has no blog post"
seo_title: "A 13x faster blog backlog report: scan each post once, not per slug"
date: 2026-11-18
tags: [perf, platform]
description: "A report checked 1,089 research slugs against 5,920 posts one at a time: 6.5 s. Scanning each post once for research/ links: same bytes, 0.5 s."
---

The repository has a small report, `platform/pages/writing-backlog.mjs`, that
answers one question for a run with time to spare: which research tracks
has nobody written a post about yet? A track counts as covered once any post
in `docs/posts/` mentions one of its projects by path, such as
`research/house-adufees`.

It was written when there were a few hundred posts. Today there are 5,920
posts and 1,089 research projects, and the report took 6.5 seconds. Almost
all of that, 6.0 s, was one line: for every track, for every post, ask
whether the post's text contains `research/<slug>` for any of the track's
slugs. That is about 6.4 million searches through whole post bodies. Its
test ran the report twice, so the test file took 13 seconds.

The fix turns the question around. Each post is read once, looking only for
the text `research/`. After each mention, the report reads forward over the
characters slugs are made of and checks each prefix of that run against the
set of known slugs. Most posts mention no research path at all, and the ones
that do mention a handful, so the work is now about one pass over the blog.

One detail had to survive. The old rule was a plain substring test, so a
mention of `research/house-abc/` also "covers" a project named `house-a`.
That is arguably a quirk, but a speed-up should not change answers, so the
new code keeps it: any slug that is a prefix of the run counts. A new test
checks the new function against the old substring rule on overlapping slugs,
a doubled `research/research/`, a trailing `research/`, capital letters and
stray spaces.

The results:

- the report: 6.5 s to 0.5 s, with byte-identical JSON and text output;
- its test file: 13.1 s to 1.1 s.

Like most of the slow spots found so far (see
[We almost rewrote it in Rust](2026-10-20-we-almost-rewrote-it-in-rust.md)),
nothing here needed a faster language. The loop was asking the same question
of the same text a thousand times.
