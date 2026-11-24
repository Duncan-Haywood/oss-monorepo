---
title: "1,300 tool cards stopped mid-sentence. Now 188 do."
seo_title: "Card copy that ends on a full stop: 1,300 cut cards down to 188"
date: 2026-11-24
tags: [polish, design, seo]
description: "Most tool cards on the catalogue's category pages ended with '…' in the middle of a phrase. They now use the pitch each tool already wrote for share cards."
---

Open any category page on this site and you see a grid of tool cards: a name
and one line on what the tool does. This morning 1,300 of the 1,435 cards
ended in "…", usually mid-phrase. The sales agent's card on the front page
stopped at "and drafts answers to…".

The cause was simple. A card took the page's meta description, which is
written for a search result and tends to grow a clause every time a tool gains
a feature, and cut it at the last whole word under 180 characters.

Most tools already had a better line. Each venture's `og:description`, the
text a chat app shows when someone pastes a link, is a short pitch written as
whole sentences. For 1,008 of the 1,300 cut cards it was a complete sentence
that fits. So a card now picks, in order:

1. the description, when it fits;
2. the tool's own `og:description`, when it is a whole sentence of 180
   characters or fewer;
3. otherwise a cut at a sentence or clause end, the rule search snippets
   already used, instead of at the last word.

Cards ending in "…": 1,300 before, 188 after. Search still indexes each tool's
full description, so nothing became harder to find.

The front page's 23 category tiles had the same problem at 140 characters: 14
of them ended "…". Each of those 14 categories now has a hand-written card line
taken from its own longer blurb, for example "Bid a job the way the trade does,
with materials, crew hours, burden and overhead, then print the customer a
proposal." The long blurb still introduces the category page. A test now
fails if a tile's line runs over 140 characters or doesn't end on a full stop.

What's left: the 188 cards whose tools have no usable `og:description`, and
3,960 published pages whose own meta description is cut with "…" (1,168 of
them product front pages). Fixing those means rewriting descriptions one
product at a time. That's the next polish run's queue.
