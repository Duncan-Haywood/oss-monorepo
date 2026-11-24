---
title: "Sixty-one flagship page titles, cut to fit a search result"
seo_title: "Cutting 61 calculator page titles to fit a search result"
date: 2026-11-24
tags: [polish, seo, clothing-design-studio, wall-framing-takeoff]
description: "Clothing Design Studio and Wall Framing Takeoff had 61 page titles of 71 to 104 characters. Each now fits in 70 with the search words first."
---

Two of the catalogue's biggest tools,
[Clothing Design Studio](../../ventures/clothing-design-studio/) and
[Wall Framing Takeoff](../../ventures/wall-framing-takeoff/), each have a page
per calculator: freight, duty, shrinkage and line sheets for a clothing brand;
gutters, soffit, stairs and concrete for a house. These pages are how people
arrive from search, so the `<title>` is the first thing they read.

A desktop search result shows about 60 to 70 characters before it cuts with
"…". 61 of these titles ran longer, between 71 and 104 characters. The longest:

> Soffit and fascia calculator: soffit panels, fascia boards, J-channel and
> frieze for a gable or hip roof *(104)*

In a result that gets cut to "Soffit and fascia calculator: soffit panels,
fascia boards, J-channel and…". It still reads fine, but the page loses control
of where the cut falls. Others lost more. The clothing tool's own home page,
"Clothing Design Studio: Design a T-Shirt or Hoodie by Voice, Cost It, Get a
Tech Pack", lost "Tech Pack", which is one of the three things it does.

## What changed

Every title is now at most 70 characters. The rules:

- **Search words first.** "Clothing Freight Calculator: Sea vs Air Cost per
  Garment" keeps the words someone types. The second clause (cartons, volume
  weight) is still in the description and on the page.
- **Only facts the old title had.** No new claims. Where something had to go,
  a list item went, not the subject: the gutter title keeps "sections,
  downspouts, hangers and fittings" and drops "for a gable or hip roof", which
  the meta description and the page still say.
- **The visible headings and any `og:title` are unchanged.** Only the head
  title moved.

A few before and after:

| Before | After |
|---|---|
| Free Virtual Garment Drape: Sew Your T-Shirt or Hoodie Pattern onto a Body and See Where It Pulls *(97)* | Free Virtual Garment Drape: See Where a T-Shirt or Hoodie Pulls *(63)* |
| Time and Action Calendar for a Clothing Line: When Must You Start to Have Stock by Launch? *(90)* | Time and Action Calendar for a Clothing Line: When to Start *(59)* |
| Wall brace calculator: how many diagonal braces and how many feet of brace a house needs *(88)* | Wall brace calculator: how many diagonal braces and feet of brace *(65)* |
| Concrete calculator: cubic yards, ready-mix order and bags for a slab, footing or pier *(86)* | Concrete calculator: cubic yards and bags for a slab, footing or pier *(69)* |

## Keeping it fixed

Each tool now has a `title-length.test.mjs` that fails if any page's title goes
over 70 characters, the same check E-invoice Preflight got
[yesterday](2026-11-23-ninety-six-e-invoicing-titles-cut-to-fit-a-search-result.md). Across the whole
catalogue, `platform/ci/check_title_meta.py` now counts 1,105 long titles,
down from 1,166. The next largest are ai-bookkeeper (17) and
league-schedule-generator (14).

We can't tell you this moved any rankings: the site has no search-console
reading for these pages yet. What we can say is that each result now shows the
whole title we wrote.
