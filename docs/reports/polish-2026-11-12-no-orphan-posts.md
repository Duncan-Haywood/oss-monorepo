# Polish 2026-11-12: every post gets an inbound related link

**Why.** Item 1 of "Still weakest" in `polish-2026-11-12-related-posts.md`: "190 posts still get no
related link" (204 of 3,936 by this run's count). The report suggested description words; I
measured the cause first. The orphans mostly *do* share rare tags (a series' newest post); they
lose because ranking is one-way. More scoring words would not fix that; a balancing pass does.

**What changed (`platform/pages/writing.mjs`).**

1. The old `relatedPosts` is now `rankRelated` (unchanged ranking).
2. `relatedPosts(post, posts, n)` returns a table built once per posts array and `n`
   (`RELATED_TABLES`, rebuilt if the array length changes): every ranked list, then for each post
   with no inbound link (in posts order) walk its own top 20 (`ORPHAN_REACH`) and replace the
   last slot of the first candidate that does not already list it, has not lent a slot, and whose
   last-slot post has ≥ 2 inbound. Only slot n changes. A post not in the array gets the plain
   ranking.
3. Test `relatedPosts gives every post an inbound link, ...` in `writing.test.mjs` (a case where
   ranking orphans `c`; checks the exact swap, no orphan at n = 1, 2, 5, only the last slot moves,
   no self or duplicate links). The ranking test now calls `rankRelated`.

**Measured.** Over the real `docs/posts` (scratch script, `relatedPosts` vs `rankRelated` over
every post): orphans 204 → 0; exactly-one inbound 381 → 591; max inbound 26 → 26; links sharing a
tag 99.6% → 99.6%; same topic 91.5% → 91.5%; all posts 1.5 s → 1.6 s. Built HTML
(`buildWriting` into a scratch dir vs the main build's `dist/writing`, counting hrefs inside the
"Related posts" block): 204 → 0 posts with no inbound link (not counting the `agents/` and
`podcast/` section indexes, which are not posts).

## Still weakest, and what I would do next

1. **591 posts hang on one inbound link.** Fine for reachability; if a later change wants more
   even spread, the same pass with a target of 2 is one constant, but it moves more fifth slots.
   Measure relevance (shared-tag share) before raising it.
2. **`.pager` is defined twice in the writing `STYLE`** (carried over, still true).
3. Carried over: the ticker's third line at 320 px; browser checks in the nightly
   (control-plane PR); `rendered-headings.mjs --max-states=400` on the 20 pages with most inputs
   (`polish-2026-11-12-input-freezes.md`).
