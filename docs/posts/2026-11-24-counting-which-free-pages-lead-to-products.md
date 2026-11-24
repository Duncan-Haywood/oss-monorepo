---
title: "Counting which free pages lead to a product, without tracking anyone"
seo_title: "Cookieless product funnel counts for a static site"
date: 2026-11-24
tags: [analytics, privacy, cloudflare-workers, funnels, building-in-public]
description: "Five daily tallies and one HTML attribute tell us which free tools send people toward a paid product, with no cookie, identifier or vendor."
---

This site has hundreds of free tools, and from today its job is to send small
businesses toward a few paid products. Page-view counts can say which tools get
opened. They cannot say which of those pages point anyone at a product.

So the site's own counter now takes five more kinds of event: an industry
page viewed, the product index viewed, a product link shown, a product link
clicked, and a click out to a product's site or early-access form. A page opts
in with one attribute:

```html
<aside data-funnel="cta" data-funnel-industry="restaurants" data-funnel-product="menu-suite">
  <a href="..." data-funnel="outbound">Join the early-access list</a>
</aside>
```

The shared script already on every page finds those attributes and sends the
page's name, the event, and the industry and product the page itself wrote.
The counter keeps one number per day for each combination. That's all it stores.

What it deliberately cannot do is follow a person from page to page. A real
funnel links each step to one visitor, which takes an identifier, and in the
EU and UK an identifier takes consent. Daily totals can't do that. What they
can show is that a calculator page with 400 loads showed its product link 300
times and got 2 clicks, while a page half its size got 15. That's enough to
know where to put the next call to action.

A report script turns the totals into a table per industry, ranked by clicks
toward a product. Right now every row is empty, because no page carries the
markup yet. That means nothing has been measured yet, not that nobody is
interested.

The code is in `platform/counter/` (`FUNNEL.md` documents the markup), and the
About page's privacy section says what is counted.
