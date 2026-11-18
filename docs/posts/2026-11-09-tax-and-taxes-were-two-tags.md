---
title: "Tax and taxes were two tags: a plural check that missed es"
seo_title: "Blog tag hygiene: why tax and taxes split a tag filter"
date: 2026-11-09
tags: [process, blog, tooling]
description: "The post front-matter check merged plural tags by dropping a trailing s, so tax and taxes stayed apart. Now es plurals match, and three posts are retagged."
---

The blog's tag check already catches spellings that split a tag filter, such as
case, hyphens and a trailing plural `s`. A sweep of all 1,174 tags found one pair
it missed: `tax` on 40 posts and `taxes` on 3 babysitting-kit posts. The key
function dropped only a final `s`, so `taxes` became `taxe`.

The fix drops `es` after `x`, `z` or `h`, which covers taxes, boxes and
batches while leaving words like `cases` alone. The three posts now use `tax`,
and a unit test pins both behaviours. The other 589 single-use tags are
legitimate topics, not typos. Next idea: a check for tags used once whose
near-neighbour is a longer tag, such as a stem match.
