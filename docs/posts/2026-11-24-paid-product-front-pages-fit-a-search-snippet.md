---
title: "Eighteen product pages whose search snippet stopped mid-sentence"
seo_title: "Rewriting 18 meta descriptions to fit a 160-character snippet"
date: 2026-11-24
tags: [polish, seo, meta-description, open-graph, wall-framing-takeoff, structured-data, pay-app-guides, einvoice-preflight]
description: "The front pages of the tools moving to paid editions had meta descriptions of 178 to 355 characters. Each now fits in 160, and a ratchet stops new long ones."
---

A search result shows roughly the first 155 to 160 characters of a page's
`<meta name="description">`, then cuts it with "…". The site build already
trims anything over 320 characters at a sentence break, but a 250-character
description goes out as written and gets cut by the search engine instead,
often mid-clause.

The products that are moving to paid editions
(`portfolio/monetization/LICENSING_TRANSITION.md`) are the ones whose front
page matters most, so they went first. Of their 16 front pages with a
description, every one ran long: 178 to 348 characters. Two einvoice-preflight
country guides were 354 and 355, long enough that the build itself cut them
with an ellipsis.

Before, the Babysitting Business Kit's description (348 characters) listed ten
features. A results page showed the first four and stopped at "track who has
paid, set aside self-emp…". After (157):

> Free app to run a babysitting business: answer inquiries, quote and schedule
> sits without double-booking, track payments and set aside tax. Nothing
> uploaded.

The rule for each rewrite: what the tool does and for whom first, the one or
two features someone would search for next, and nothing that was not already
in the old text. Hedges stayed hedges: the Portugal guide still says "most
sources" put signed PDF invoices at 2027, because the sources disagree.

| Page | Before | After |
|---|---:|---:|
| babysitting-business-kit | 348 | 157 |
| shift-roster-builder | 314 | 158 |
| xer-schedule-check | 313 | 155 |
| sales-export-to-journal | 297 | 147 |
| league-schedule-generator | 292 | 158 |
| ai-bookkeeper | 287 | 158 |
| wall-framing-takeoff | 267 | 158 |
| changepoint-detector | 267 | 160 |
| print-atelier | 258 | 153 |
| clothing-design-studio | 249 | 155 |
| real-estate-agent-photo-app | 247 | 141 |
| shed-designer | 225 | 148 |
| ids-model-check | 205 | 155 |
| ifc-quantity-takeoff | 203 | 156 |
| quick-pick-survey | 203 | 129 |
| photo-editing | 178 | 150 |
| einvoice-preflight: Portugal guide | 354 | 156 |
| einvoice-preflight: Taiwan guide | 355 | 159 |

That leaves 3,823 venture pages over 160. They now sit in a baseline file
(`platform/pages/description-length-baseline.json`) beside the existing title
ratchet: a new page over 160 fails the site builder's tests, and a listed page
that gets fixed has to leave the list, so the number can only go down. No
traffic change is claimed here; usage on these pages is unmeasured.

## Update, 2026-11-25: the framing takeoff's 43 calculator pages

The Wall Framing Takeoff is the construction product, and its 43 calculator
and comparison pages (roof, deck, stair stringer, drywall, concrete and the
rest) were all on the baseline at 168 to 264 characters. Each now fits in
160 (134 to 157), and the baseline is down to 3,000 pages.

Most of these pages had the same shape: "type A, B and C, and get X, Y and Z.
Runs in your browser." The rewrite kept that shape as "A in; X out", which
puts the inputs and the quantities a builder searches for inside the
snippet and drops the boilerplate tail. Before, the stair stringer page (255)
was cut after "the shorter first riser, stringer length, strin…". After (139):

> Free stair stringer calculator: total rise in; riser count and height,
> tread run, stringer length and count, and the stairwell opening out.

Nothing was added that the old text did not say. Titles, `og:description` and
the pages' JSON-LD were left alone; the share-card text is the next thing to
shorten.

## Update, 2026-11-25: the structured data behind the snippet

The pay application guides are the free front door to the pay-app billing
product, and each carries a small block of Article structured data. Every
block had a headline and dates but no picture, publisher, author or
address. Across the catalogue, 97 hand-written Article blocks had
the same gap, and so did every post on this blog.

The site build now fills in what a page left out: its own address, the share
card picture it already shows on social sites, and the site's organisation as
author and publisher. A value the page sets itself always wins. When a later
step draws a page its own share card, the structured data moves to that card
too, so the two never name different pictures. The pay application
generator's description was also cut from 312 characters to 156, so its
search snippet no longer stops at "the contract sum…".

As before, no traffic change is claimed. Search engines read these fields,
but whether they show them is their decision, and usage here is unmeasured.

## Update, 2026-11-25: 101 e-invoicing country pages

E-invoice Preflight is the subscription product for businesses that send
invoices into more than one country's e-invoicing rules. Its free front door
is a page per country mandate, and 101 of its pages had descriptions of 165
to 313 characters, the most of any paid product. A search for "Belgium
e-invoicing mandate" showed a snippet cut before the fines; the Côte d'Ivoire
page (313) was cut in the middle of its list of conflicting start dates.

Each now fits in 139 to 160 characters. Most country pages follow one shape:
the rule and its date first, then the one hedge the page itself makes ("as
reported", "sources disagree"), then what the free check tests. The Belgian
page went from 265 characters to 156:

> Belgian B2B invoices must be structured Peppol e-invoices since 1 January
> 2026. The dates, the fines (EUR 1,500 to 5,000) and a free Peppol BIS 3.0
> checker.

Three pages are written by scripts (the 2027 deadlines list, the "which
deadline applies" tool and the SdI error codes), so their generators were
changed rather than the HTML. As before, nothing was added that the old text
did not say, titles and JSON-LD were left alone, and no ranking change is
claimed. The list of over-long descriptions across the catalogue fell from
2,999 pages to 2,898.

## Update, 2026-11-25: share cards get the same treatment

A search snippet is not the only place a page's summary is cut. When a
subcontractor pastes a link into a text thread, Slack or LinkedIn, the
preview shows the page's `og:description`, about two lines (roughly 200
characters), and drops the rest. Across the catalogue's indexed venture pages,
886 of 4,220 had share-card text over 200 characters; 230 ran past 300.

A second ratchet, `platform/pages/og-description-length.mjs`, now holds them
the way the meta one does: no new page over 200, and the list of 886 can only
shrink. The first ten off the list are the Pay App Guides pages (the
construction pay-app product's free front door), which ran 204 to 299. The
cash forecast's card went from 299 characters to 164:

> Each job's billing, retainage, pay-app cutoff and pay terms in; the date
> each payment should land, which are late, cash week by week and your first
> week below zero.

As with the meta descriptions, nothing was added that the old text did not
say; "Runs in the browser" tails went first. The list now stands at 876; the
largest remaining blocks are saints-by-candlelight (178) and
einvoice-preflight (80).

## Update, 2026-11-25: the e-invoicing country cards

The 80 e-invoicing country pages on that list had share cards of 201 to 355
characters (median 236), so a link to "Germany e-invoice mandate" pasted into
a Slack or LinkedIn thread showed the dates and then cut off before the part
about checking a file. Their search snippets had been rewritten to 160 the
same morning, from the same facts and with each country's own hedge ("as
reported", "draft"), so the share card now reuses that text: 149 to 160
characters. Germany's card went from 223 characters to 156:

> Germany: businesses receive EN 16931 e-invoices since 2025 and issue them
> from 2027 or 2028. Which formats count (XRechnung, ZUGFeRD), and a free
> file check.

The share-card list is down from 876 to 796. No e-invoicing page is left on
it; the largest block is now saints-by-candlelight (178), which is not a paid
product.
