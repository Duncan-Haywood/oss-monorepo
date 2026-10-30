---
title: "A shed cost that left out the door, and a page that drifted from its tool"
seo_title: "A shed cost that left out the door, and a page that drifted"
date: 2026-10-29
description: "Auditing Shed Designer's prices: estimates shown as listings, a store compared with itself, a total missing the door, and a page now tested against its tool."
tags: [shed-designer, honesty, testing, pricing]
---

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)
frames a gable shed board by board and prices the result from store listings,
each linked with the date it was seen. On its first night it had an audit of
one question: does every price and every number say truthfully where it came
from? Four things did not.

**Estimates that looked like listings.** A price with no readable listing is
marked as an estimate in the data. But when an estimate linked the page it was
estimated from (the gravel price links the cost guide it came from), the
shopping list showed it as a plain store link with a date, exactly like a real
listing. The page and the CSV now share one label function, and anything that
is not the listing's own number says "(estimate)" or "(scaled)".

**A store compared with itself.** The same Home Depot panel appeared twice:
once in the price list at $46.78, once in the store comparison at $43.98, read
from two copies of the same page. Because the comparison took the second
figure, it reported a $16.80 saving for buying T1-11 at Home Depot instead of
at Home Depot. A line's own store now always shows the price the line uses,
and a test fails if the two files disagree again.

**A total without the door.** In the "8x12 classic" preset the door and both
windows are custom sizes. A custom-size opening is framed but adds nothing to
the shopping list, so the $3,284.59 total quietly excluded them. The tool now
names each one under the total as "not in the total" until a unit is picked
or the door is set to be built on site.

**A page that drifted.** The marketing page's worked example quoted the
tool's own output: 144 pieces, 93 boards, $2,166.66 for the whole shed. By
the time it was audited the tool printed different numbers, and a rewrite
earlier the same night had drifted again within hours as the cut optimizer
improved. Every number on that page is now tagged, and a test recomputes each
one from the engine and the starting prices. The page cannot fall behind the
tool any more without the test going red.

## What could be re-checked

The prices were first read from search-result copies of product pages. This
time the audit tried the pages themselves. Home Depot product pages load but
carry no price until a store is chosen. Lowe's answered 403. Those prices
keep their "read from a search result" notes. The window maker's four prices
and the shed-door seller's three matched their own pages to the cent.

Menards pages do show a price, with a catch: the schema.org price on the page
is the value after Menards' 11% mail-in rebate, not the shelf price, which is
a separate field. Read that way, four of thirteen Menards prices looked to
have moved by $0.33 to $1.36, in both directions. Those numbers were not
committed. Menards answered the later requests with a bot challenge, and
big-box terms of use forbid scraping, so a script that reads their pages is
not something this tool should ship. The four stay as they were, flagged for
a person to check in a browser. Sellers whose robots.txt invites it (the
window maker, the door seller, a hardware store) get a small re-check script
instead.

The tool is free and runs in the browser. Nothing in it is engineered or
code-checked; a building department or a designer who can stamp drawings
decides what you may build.
