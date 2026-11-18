---
title: "204 posts that no other post linked to, and the one slot that fixes each"
seo_title: "Related posts: giving every blog post at least one inbound link"
date: 2026-11-12
tags: [polish, seo, site, writing]
description: "204 of 3,936 posts had no inbound related-post link. A balancing pass now gives each one by borrowing its best match's weakest slot."
---

Earlier today the "Related posts" list at the foot of every post here stopped
being the same five posts on every page
([that change](https://marisstella.app/writing/every-post-pointed-at-the-same-five/)). It ranks
other posts by the tags and title words they share, weighting rare ones higher.
That left one gap, noted in that run's report: **204 of the 3,936 posts were
linked from no other post's list.** A reader could only reach them from the
blog index, a tag filter or a search engine, and a crawler following links
between posts never would.

## Why a ranked list leaves orphans

Ranking is one-way. Post A lists the five posts that suit A best. If every post
that suits A has five posts that suit it better, nobody lists A. Many of the
204 were the newest post in a series: its closest matches are its siblings,
and each sibling already has closer siblings.

## The fix: borrow the weakest slot of the orphan's best match

After all lists are ranked, the build counts inbound links. For each post with
none, it walks the orphan's own ranking, best match first, and takes the first
post that can spare a slot:

- that post does not already list the orphan, and has not lent a slot yet;
- the post in its fifth (weakest) slot is linked from somewhere else too, so
  the fix cannot make a new orphan.

The orphan goes into that fifth slot. The score is symmetric, so the link back
is as strong as the orphan's own top link. The first four slots of every list
never change.

## Numbers (all 3,936 posts, `relatedPosts` over the real `docs/posts`)

| | ranking only | balanced |
|---|---|---|
| posts with no inbound related link | 204 | **0** |
| posts with exactly one | 381 | 591 |
| most inbound links to one post | 26 | 26 |
| links that share a tag with their page | 99.6% | 99.6% |
| links in the same topic | 91.5% | 91.5% |
| lists that changed | | 204 (fifth slot only) |
| time for all posts | 1.5 s | 1.6 s |

The built site agrees. Counting the links inside each built post's "Related
posts" block found 204 posts with no inbound link on the current build and 0 with
this change.

Some of the swaps, the dropped link first:

- On the 1945 temperature-step changepoint post, "Can a changepoint detector
  find SARS and the Sydney Olympics in visitor data?" gave way to "Checking our
  changepoint detector against the dates it claims to find".
- On the stair stringer post, "How many connectors does a stair stringer need
  at the top?" gave way to "The stair card now takes the notched-support check".
- On a Saints by Candlelight episode, episode 38 gave way to "Ambrose and the
  bees".

We can't say what this does to search traffic: usage on this site is not
measured. What we can say is that every post can now be reached by following
links from another post, and the lists say no less about what's related than
before.

The code is `relatedPosts` and `rankRelated` in
`platform/pages/writing.mjs`, with a test that builds a small case where
ranking alone orphans a post.
