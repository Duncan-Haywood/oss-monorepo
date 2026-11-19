---
title: "Ask an Etsy question, get Etsy pages: weighing words by how rare they are"
date: 2026-11-19
tags: [site, search, assistant, polish]
description: "The site assistant answered an Etsy question with a Discogs page. Weighing each word by its rarity fixed it and improved 9 of 26 test questions."
---

The [Ask page](/ask/) answers a typed question with the site's own pages, without a model. Until
today, "How much does Etsy take from a sale?" led with a page about Discogs.

The cause was arithmetic. After dropping words like *how*, *much* and *does*, three words are
left: *etsy*, *take* and *sale*. The ranking gave each word the same 4 points for appearing in a
page's title. "How Much Does Discogs Take Per Sale?" has two of them, so did the Etsy pages, and
the tie went to whichever came first in the index.

But the words are not equal. Of 11,387 entries in the search index, *etsy* appears in about 0.3%
and *take* in about 9%. A page that matches the rare word is much more likely to be what you meant.
So each word now counts in proportion to how rare it is (the old search-engine idea of inverse
document frequency). Whether a match is good enough to list at all is decided as before, so this
only changes the order.

Across 26 test questions, run against the real index:

- **9 better.** The Etsy questions now return only Etsy pages, including the Etsy Profit
  Calculator. "How do I price a bathroom remodel?" went from carpet cleaning, daycare and home
  inspection to bathroom rough-in, toilet and shower bid calculators. "What should I charge for
  house cleaning?" now lists the House Cleaning Quote Calculator.
- **14 the same.**
- **2 slightly worse.** A roofing question's third link is now a post about drawing a barn roof
  rather than "How to price a roof by the square".
- **1 mixed.**

There is still no Etsy *fee* page in the top three: the fee shelf's text never says "take". That,
and the over-weighting of words like *tool* that every page shares, are the next steps. Each
question takes about 42 ms to rank instead of 29 ms, once, when you press Ask.
