---
title: "Eighteen product pages whose search snippet stopped mid-sentence"
seo_title: "Rewriting 18 meta descriptions to fit a 160-character snippet"
date: 2026-11-24
tags: [polish, seo, meta-description, wall-framing-takeoff]
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
