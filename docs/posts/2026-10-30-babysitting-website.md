---
title: "A babysitter's website that only says what the sitter wrote"
date: 2026-10-30
tags: [babysitting-business-kit, website, local-seo, accessibility]
description: "The Babysitting Business Kit now builds a four-page site in three themes from the sitter's own fields, hides any empty section, and downloads as a zip for free static hosting."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) used to make a one-page website. Now its Website tab builds a small site. A babysitter can drop it on Netlify, Cloudflare Pages or GitHub Pages, or serve it from the kit's optional self-hosted server at `/site/`.

**One rule: only the sitter's words.** Every sentence on the site comes from a field the sitter filled in: their story, rates, the towns they serve, "what a sit looks like", what happens at the first sit, how they keep kids safe, and their cancellation, payment and sick-child policies. Leave a field empty and its section, its FAQ entry and, if nothing is left, its whole page go away. There is one fallback. With no cancellation text, the site uses the sitter's own rate card ("Cancelling with less than 24 hours' notice: 50% of the booked sit"). Testimonials still appear only when the family said yes. The faith section still appears only when the sitter ticks it, and a family's beliefs are never asked or scored.

**What the invented example produces.** With the example desk plus a few website fields, the generator writes four pages: home (6.2 KB), about (4.5 KB), policies (4.4 KB) and FAQ (5.5 KB), plus `robots.txt` and `sitemap.xml`. The zip comes to about 22 KB. The FAQ in the test fixture has nine questions, and each answer is built from a field. For example, "How much do you charge?" comes from the rate card, and "What if my child is sick?" from the sick-child policy.

**Three themes, checked for contrast.** Warm, bright and simple. A test computes the WCAG contrast ratio for every text colour each theme draws against both of its backgrounds. The lowest pair is the bright theme's green accent on its pale blue page, at 5.96:1. The bar for AA body text is 4.5:1. The layout is mobile first: in a 360-pixel-wide browser, none of the three themes scrolls sideways.

**Local search basics, nothing more.** The page title is "Business name: babysitter in Town". The description names the towns served, the certifications and the hourly rate, and is cut to 160 characters. Each page has `ChildCare` structured data whose `areaServed` lists the sitter's towns, Open Graph tags, and `FAQPage` data on the FAQ page. Once the sitter enters their site's address, it also writes canonical links, a sitemap with absolute URLs and a `robots.txt` that points to it. With no address there is no sitemap, because a sitemap needs absolute URLs.

**Certifications have dates now.** A line like `CPR and First Aid | 2026-03 | 2028-03` shows as "since March 2026 (valid through March 2028)". A certificate whose valid-through date has passed is hidden from the site, and the tab says so, so the site never shows an expired qualification.

**The zip writer is about 50 lines with no dependency.** Stored entries only, with a CRC-32 that matches the standard check value (`cbf43926` for "123456789") and Node's own `zlib.crc32`. The tests read the archive back through its central directory, the way unzip tools do. Python's `zipfile` also checks the downloaded file without errors.

**A "get found locally" checklist.** The tab lists the steps: use the same name, phone and town everywhere, then set up a Google Business Profile as a service-area business with the home address hidden, a Nextdoor business page, a Facebook Page, your church directory or bulletin, school and parent-group lists, and printed cards. Each item is a plain step with a checkbox. It does not promise what any step will bring in, and a test fails if the wording starts to.

The source is in [`ventures/babysitting-business-kit/site.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit). It is free and MIT-licensed.
